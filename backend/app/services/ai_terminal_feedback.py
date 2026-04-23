import json
import logging
import re
import shlex

import requests

from app.config import settings
from app.services import openai_tutor
from app.services.task_evaluator import command_matches_hint, evaluate_task_attempt

logger = logging.getLogger("securestack.ai_tutor")

LOW_SIGNAL_PREFIXES = ("ping", "pwd", "ls")
HELP_COMMAND_PREFIXES = ("help", "hint", "stuck", "what next", "why", "how", "?")
HELP_COMMAND_MARKERS = ("--help", " -h", " man ", " explain ")
OPENAI_DEEP_TUTOR_INTENTS = {"explain", "stuck"}
OPENAI_DEEP_MESSAGE_MARKERS = (
    "why",
    "how does",
    "how do",
    "explain",
    "what does",
    "what is happening",
    "confused",
    "lost",
    "stuck",
    "concept",
    "debrief",
    "reflection",
    "summarize what",
)
OPENAI_TUTOR_FIELDS = (
    "explanation",
    "security_relevance",
    "learning_reinforcement",
    "next_step",
    "warning",
)
PHASE_BY_STEP_TYPE = {
    "command": "reconnaissance",
    "browser": "general-navigation",
}
ASK_TUTOR_INTENTS = {
    "hint": {
        "label": "Give me a hint",
        "min_hint_level": 1,
        "teaching_style": "directional_hint",
    },
    "explain": {
        "label": "Explain this step",
        "min_hint_level": 1,
        "teaching_style": "concept_explanation",
    },
    "stuck": {
        "label": "I'm stuck",
        "min_hint_level": 2,
        "teaching_style": "stuck_support",
    },
    "what_next": {
        "label": "What should I do next?",
        "min_hint_level": 1,
        "teaching_style": "next_move",
    },
    "idle_nudge": {
        "label": "Tutor check-in",
        "min_hint_level": 1,
        "teaching_style": "idle_checkin",
    },
}
HINT_LABELS = {
    0: "Observation",
    1: "Subtle hint",
    2: "Stronger hint",
    3: "Near-complete guidance",
}
TUTOR_MODE_LABELS = {
    "observation": "Observation",
    "subtle_hint": "Subtle hint",
    "strong_hint": "Stronger hint",
    "near_complete_guidance": "Near-complete guidance",
    "redirect": "Redirect",
    "success_explanation": "Learning reinforcement",
}
INTERVENTION_LABELS = {
    "success_reinforcement": "Success reinforcement",
    "progress_briefing": "Progress check-in",
    "off_track_redirect": "Off-track redirect",
    "browser_handoff_guidance": "Browser handoff",
    "stuck_intervention": "Stuck intervention",
    "idle_nudge": "Idle nudge",
}


def _truncate(value: str, limit: int = 1600) -> str:
    cleaned = (value or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}\n...[truncated]"


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_split(command: str) -> list[str]:
    try:
        return shlex.split(command or "")
    except ValueError:
        return (command or "").split()


def _extract_primary_command(command: str) -> str:
    tokens = _safe_split(command)
    return tokens[0].lower() if tokens else ""


def _primary_expected_tool(context: dict | None) -> str:
    step_command_hint = (context or {}).get("step_command_hint") or ""
    return _extract_primary_command(step_command_hint)


def _is_help_request_command(command: str) -> bool:
    normalized = (command or "").strip().lower()
    if not normalized:
        return False

    if normalized in HELP_COMMAND_PREFIXES:
        return True

    if any(normalized.startswith(f"{prefix} ") for prefix in HELP_COMMAND_PREFIXES):
        return True

    if any(marker in f" {normalized} " for marker in HELP_COMMAND_MARKERS):
        return True

    return False


def _format_recent_commands(
    context: dict | None, limit: int = 3, output_limit: int = 220
) -> str:
    if not context:
        return "No recent command history available."

    recent_commands = context.get("recent_commands") or []
    if not recent_commands:
        return "No recent command history available."

    lines = []
    for index, item in enumerate(recent_commands[-limit:], start=1):
        command = _truncate(item.get("command", ""), 120)
        output = _truncate(item.get("output", ""), output_limit)
        assessment = item.get("assessment")
        notes = []
        if assessment:
            notes.append(f"assessment={assessment}")
        if item.get("off_track_detected"):
            notes.append("off_track")
        if item.get("help_request_detected"):
            notes.append("help_request")

        lines.append(f"{index}. Command: {command or '[missing]'}")
        if notes:
            lines.append(f"   Tutor notes: {', '.join(notes)}")
        if output:
            lines.append(f"   Output excerpt: {output}")

    return "\n".join(lines)


def _format_recent_tutor_messages(
    context: dict | None, limit: int = 4, content_limit: int = 160
) -> str:
    if not context:
        return "No recent tutor conversation available."

    recent_messages = context.get("recent_tutor_messages") or []
    if not recent_messages:
        return "No recent tutor conversation available."

    lines = []
    for item in recent_messages[-limit:]:
        role = "Tutor" if item.get("role") == "tutor" else "Student"
        content = _truncate(item.get("content", ""), content_limit)
        if content:
            lines.append(f"- {role}: {content}")

    return "\n".join(lines) if lines else "No recent tutor conversation available."


def _format_observation_focus(
    context: dict | None, limit: int = 3, item_limit: int = 120
) -> str:
    if not context:
        return "No authored observation focus available."

    observations = context.get("step_what_to_observe") or []
    if not observations:
        return "No authored observation focus available."

    cleaned = []
    for item in observations[:limit]:
        if isinstance(item, str) and item.strip():
            cleaned.append(_truncate(item.strip(), item_limit))

    return "; ".join(cleaned) if cleaned else "No authored observation focus available."


def _build_observation_coaching(context: dict | None) -> str:
    observation_focus = _format_observation_focus(context, limit=2, item_limit=90)
    if observation_focus == "No authored observation focus available.":
        return ""

    observation_significance = (context or {}).get("step_why_observation_matters") or ""
    if observation_significance:
        return (
            f"Watch for {observation_focus.lower()}. "
            f"That matters because {observation_significance.lower()}."
        )

    return f"Watch for {observation_focus.lower()}."


def _infer_tutor_intent_from_message(message: str | None) -> str:
    normalized = (message or "").strip().lower()
    if not normalized:
        return "hint"

    if any(
        marker in normalized
        for marker in ("stuck", "confused", "lost", "not sure", "don't know")
    ):
        return "stuck"

    if any(
        marker in normalized
        for marker in (
            "what next",
            "what should i do next",
            "next step",
            "where do i go next",
            "what now",
        )
    ):
        return "what_next"

    if any(
        marker in normalized
        for marker in ("explain", "why", "what does", "what is happening", "how does")
    ):
        return "explain"

    return "hint"


def _normalize_tutor_intent(
    intent: str | None, learner_message: str | None = None
) -> dict:
    normalized = (intent or "").strip().lower().replace("-", "_")
    if not normalized:
        normalized = _infer_tutor_intent_from_message(learner_message)

    if normalized in ASK_TUTOR_INTENTS:
        return {"key": normalized, **ASK_TUTOR_INTENTS[normalized]}

    return {"key": "hint", **ASK_TUTOR_INTENTS["hint"]}


def _build_context_block(
    context: dict | None, tutor_state: dict | None = None, mode: str = "fast"
) -> str:
    if not context:
        return "No structured lab context was available for this command."

    lab_name = context.get("lab_name") or "Unknown lab"
    step_number = context.get("step_number")
    step_title = context.get("step_title") or "No active step"
    step_instruction = context.get("step_instruction") or ""
    step_explanation = context.get("step_explanation") or ""
    step_objective = context.get("step_objective") or step_instruction or ""
    step_outcome = context.get("step_expected_outcome") or _format_expected_outcome(
        context
    )
    step_hint = context.get("step_hint") or ""
    step_status = context.get("step_status") or "pending"
    observation_focus = _format_observation_focus(context, limit=3, item_limit=100)
    observation_significance = (context.get("step_why_observation_matters") or "").strip()
    hint_level = tutor_state.get("hint_level", 0) if tutor_state else 0
    ask_label = (
        tutor_state.get("ask_label", "None")
        if tutor_state and tutor_state.get("ask_label")
        else "None"
    )

    lines = [
        f"Lab: {lab_name}",
        f"Step: {step_number or 'Not set'} - {step_title}",
        f"Objective: {step_objective or 'No step objective available.'}",
        f"Expected outcome: {step_outcome or 'No expected outcome recorded.'}",
        f"Status: {step_status}",
        (
            f"Adaptive state: hint_level={hint_level}, help_requests={context.get('step_help_requests', 0)}, "
            f"off_track={context.get('step_off_track_count', 0)}, struggle={context.get('step_consecutive_struggle_count', 0)}, ask={ask_label}"
        ),
    ]

    if step_hint:
        lines.append(f"Hint: {step_hint}")
    if observation_focus != "No authored observation focus available.":
        lines.append(f"What to observe: {observation_focus}")

    if mode == "deep":
        pre_lab_context = (context.get("lab_pre_lab_context") or "").strip()
        environment_overview = (context.get("lab_environment_overview") or "").strip()
        topology_summary = context.get("topology_summary") or ""
        if pre_lab_context:
            lines.append(f"Pre-lab context: {_truncate(pre_lab_context, 220)}")
        if environment_overview:
            lines.append(f"Environment overview: {_truncate(environment_overview, 180)}")
        if topology_summary:
            lines.append(f"Topology: {_truncate(topology_summary, 180)}")
        if step_instruction and step_instruction != step_objective:
            lines.append(f"Instruction: {step_instruction}")
        if step_explanation:
            lines.append(f"Explanation: {_truncate(step_explanation, 220)}")
        if observation_significance:
            lines.append(
                f"Why the observation matters: {_truncate(observation_significance, 180)}"
            )
        lines.append(
            f"Recent commands:\n{_format_recent_commands(context, limit=3, output_limit=180)}"
        )
        lines.append(
            "Recent tutor conversation:\n"
            f"{_format_recent_tutor_messages(context, limit=4, content_limit=140)}"
        )
    else:
        lines.append(
            f"Recent commands:\n{_format_recent_commands(context, limit=2, output_limit=120)}"
        )

    return "\n".join(lines)


def build_terminal_prompt(
    command: str,
    output: str,
    context: dict | None = None,
    tutor_state: dict | None = None,
    mode: str = "fast",
) -> str:
    concise_guardrail = (
        "Keep each field short and practical. Prefer one or two sentences."
        if mode == "fast"
        else "You may go a little deeper, but stay concise and instructional."
    )
    output_limit = 1400 if mode == "fast" else 2400

    return f"""
You are Secure Stack's AI cybersecurity lab tutor.

Analyze the learner's latest lab command using the current lab guide context.

Structured lab context:
{_build_context_block(context, tutor_state, mode=mode)}

Latest command:
{_truncate(command, 240)}

Latest output:
{_truncate(output, output_limit)}

Response style:
- {concise_guardrail}
- If the learner is off-track, redirect them to the current step objective.
- If the learner succeeds, explain why the result matters before moving on.
- Do not reveal the exact command too early unless the hint level allows it.

Requirements:
1. Classify the phase.
2. Assess the command.
3. Explain what the output means for the active step.
4. State why it matters.
5. Give the next best step using the current hint level.
6. Only create a finding for strong, report-worthy evidence.

Return ONLY valid JSON in this exact format:
{{
  "assessment": "useful | neutral | risky | incorrect",
  "phase": "reconnaissance | enumeration | exploitation | post-exploitation | general-navigation",
  "explanation": "brief explanation",
  "security_relevance": "why it matters",
  "learning_reinforcement": "teaching-oriented explanation",
  "next_step": "recommended next command or action",
  "warning": "",
  "finding_detected": false,
  "finding_confidence": "low | medium | high",
  "finding": null
}}
""".strip()


def _get_response_mode(tutor_state: dict, response: dict | None = None) -> str:
    if response and response.get("response_mode") in {"fast", "deep"}:
        return response["response_mode"]

    if tutor_state.get("ask_intent") in {"explain", "stuck"}:
        return "deep"

    return "fast"


def _apply_response_length_limits(response: dict, response_mode: str) -> dict:
    limited = dict(response)
    limits = (
        {
            "explanation": 420,
            "security_relevance": 320,
            "learning_reinforcement": 360,
            "next_step": 260,
            "warning": 220,
        }
        if response_mode == "deep"
        else {
            "explanation": 220,
            "security_relevance": 180,
            "learning_reinforcement": 200,
            "next_step": 180,
            "warning": 160,
        }
    )

    for field, limit in limits.items():
        value = limited.get(field)
        if isinstance(value, str):
            limited[field] = _truncate(value, limit)

    finding = limited.get("finding")
    if isinstance(finding, dict):
        limited["finding"] = {
            **finding,
            "title": _truncate(finding.get("title", ""), 120),
            "description": _truncate(
                finding.get("description", ""),
                260 if response_mode == "deep" else 180,
            ),
            "evidence": _truncate(
                finding.get("evidence", ""),
                420 if response_mode == "deep" else 260,
            ),
        }

    return limited


def _extract_json(text: str) -> str:
    text = text.strip()

    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()

    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]

    if start != -1 and end == -1:
        repaired = text[start:]
        repaired += "}" * (repaired.count("{") - repaired.count("}"))
        return repaired

    return text


def _contextual_next_step(context: dict | None) -> str:
    if not context:
        return "Continue with the guided lab steps and review the output manually."

    step_number = context.get("step_number")
    step_title = context.get("step_title")
    step_hint = context.get("step_hint")
    step_instruction = context.get("step_instruction")

    if step_hint:
        return step_hint

    if step_number and step_title:
        return f"Continue validating step {step_number}: {step_title}."

    if step_instruction:
        return step_instruction

    return "Continue with the guided lab steps and review the output manually."


def _contextual_follow_up_step(context: dict | None) -> str:
    if not context:
        return "Continue with the next guided lab validation step."

    next_step_number = context.get("next_step_number")
    next_step_title = context.get("next_step_title")
    next_step_action = context.get("next_step_action")
    next_step_instruction = context.get("next_step_instruction")
    next_step_hint = context.get("next_step_hint")

    if next_step_number and next_step_title and next_step_action:
        return (
            f"Move to step {next_step_number}: {next_step_title}. "
            f"Next action: {next_step_action}"
        )

    if next_step_number and next_step_title and next_step_instruction:
        return f"Move to step {next_step_number}: {next_step_title}. {next_step_instruction}"

    if next_step_hint:
        return next_step_hint

    if next_step_action:
        return next_step_action

    return _contextual_next_step(context)


def _default_response(warning: str = "", context: dict | None = None) -> dict:
    return {
        "assessment": "neutral",
        "phase": "general-navigation",
        "explanation": "The command completed, but the analysis was unclear.",
        "security_relevance": "No strong security conclusion could be drawn from this output alone.",
        "learning_reinforcement": "",
        "next_step": _contextual_next_step(context),
        "warning": warning[:500] if warning else "",
        "finding_detected": False,
        "finding_confidence": "low",
        "finding": None,
        "hint_level": 0,
        "hint_label": HINT_LABELS[0],
        "tutor_mode": "observation",
        "teaching_focus": "",
        "help_request_detected": False,
        "help_requests": 0,
        "off_track_detected": False,
        "stuck_detected": False,
        "step_completed_detected": False,
    }


def _connectivity_guidance(command: str, output: str, context: dict | None = None):
    command_lower = (command or "").strip().lower()
    output_lower = (output or "").lower()

    if not command_lower.startswith("ping"):
        return None

    successful_markers = ("bytes from", "0% packet loss", "1 received", "icmp_seq")
    if not any(marker in output_lower for marker in successful_markers):
        return None

    return {
        "assessment": "useful",
        "phase": "reconnaissance",
        "explanation": "The ping response confirms the attacker can resolve and reach the target across the isolated lab network.",
        "security_relevance": "Connectivity validation proves the lab path is working before you spend time on deeper service enumeration.",
        "next_step": _contextual_follow_up_step(context),
        "warning": "",
        "finding_detected": False,
        "finding_confidence": "low",
        "finding": None,
    }


def _is_low_signal_command(command: str) -> bool:
    command_lower = (command or "").strip().lower()
    return command_lower.startswith(LOW_SIGNAL_PREFIXES)


def _is_unclear_output(output: str) -> bool:
    cleaned = (output or "").strip()
    if not cleaned:
        return True

    if len(cleaned) < 40 and "open" not in cleaned.lower() and "http/" not in cleaned.lower():
        return True

    return False


def _recon_finding(command: str, output: str, context: dict | None = None):
    command_lower = (command or "").strip().lower()
    output_text = (output or "").strip()
    output_lower = output_text.lower()
    current_step_next = _contextual_next_step(context)
    follow_up_step = _contextual_follow_up_step(context)

    if command_lower.startswith("nmap"):
        open_services = re.findall(
            r"(?m)^(\d+)/(tcp|udp)\s+open\s+([^\s]+)(?:\s+(.*))?$",
            output_text,
        )
        if open_services:
            service_summary = ", ".join(
                f"{port}/{proto} {service}".strip()
                for port, proto, service, _version in open_services
            )
            return {
                "assessment": "useful",
                "phase": "enumeration",
                "explanation": "The nmap scan identified exposed network services on the target.",
                "security_relevance": "Open ports and exposed services define the reachable attack surface for the application.",
                "next_step": follow_up_step or "Inspect the exposed web service with curl http://target:3000.",
                "warning": "",
                "finding_detected": True,
                "finding_confidence": "high",
                "finding": {
                    "title": "Exposed Network Services Detected",
                    "severity": "Medium",
                    "description": f"The target exposes the following reachable services: {service_summary}.",
                    "evidence": output_text[:1200],
                },
            }

        return {
            "assessment": "useful",
            "phase": "enumeration",
            "explanation": "The nmap scan completed, but it did not reveal a confirmed exposed service in the captured output.",
            "security_relevance": "Service enumeration is still valuable recon even when it does not immediately produce a finding.",
            "next_step": current_step_next or "Continue to application-layer validation with curl http://target:3000.",
            "warning": "",
            "finding_detected": False,
            "finding_confidence": "low",
            "finding": None,
        }

    if command_lower.startswith("curl"):
        if "owasp juice shop" in output_lower or ("http/1.1 200 ok" in output_lower and "<html" in output_lower):
            return {
                "assessment": "useful",
                "phase": "enumeration",
                "explanation": "The curl response confirms that the target is serving the Juice Shop web application.",
                "security_relevance": "A reachable web application is a meaningful exposed attack surface and should be included in the recon narrative.",
                "next_step": follow_up_step or "Open the browser URL and continue investigating the exposed web application.",
                "warning": "",
                "finding_detected": True,
                "finding_confidence": "high",
                "finding": {
                    "title": "Exposed Juice Shop Web Application",
                    "severity": "Medium",
                    "description": "The target returned Juice Shop application content, confirming that the web application is reachable.",
                    "evidence": output_text[:1200],
                },
            }

        return {
            "assessment": "useful",
            "phase": "enumeration",
            "explanation": "The HTTP request completed, but the captured response did not provide strong enough evidence for a reportable finding.",
            "security_relevance": "HTTP validation still helps confirm whether the service is reachable and what should be inspected next.",
            "next_step": current_step_next or "Review the response and open the browser URL for manual inspection.",
            "warning": "",
            "finding_detected": False,
            "finding_confidence": "low",
            "finding": None,
        }

    return None


def _low_signal_response(command: str, warning: str = "", context: dict | None = None) -> dict:
    response = _default_response(warning, context)
    step_title = context.get("step_title") if context else None
    step_objective = context.get("step_objective") if context else None
    step_reference = (
        f" for {step_title}" if step_title else ""
    )
    response.update(
        {
            "assessment": "neutral",
            "phase": "reconnaissance",
            "explanation": f"`{command}` is low-signal setup or navigation output and should not create a report finding on its own{step_reference}.",
            "security_relevance": (
                "It helps orient the learner, but it does not provide strong security evidence by itself."
                if not step_objective
                else f"It helps orient the learner while working toward: {step_objective}"
            ),
            "next_step": _contextual_next_step(context),
        }
    )
    return response


def _normalize_response(data: dict, context: dict | None = None) -> dict:
    normalized = _default_response(context=context)

    normalized["assessment"] = data.get("assessment", normalized["assessment"])
    normalized["phase"] = data.get("phase", normalized["phase"])
    normalized["explanation"] = data.get("explanation", normalized["explanation"])
    normalized["security_relevance"] = data.get(
        "security_relevance", normalized["security_relevance"]
    )
    normalized["learning_reinforcement"] = data.get(
        "learning_reinforcement", normalized["learning_reinforcement"]
    )
    normalized["next_step"] = data.get("next_step", normalized["next_step"])
    normalized["warning"] = data.get("warning", normalized["warning"])
    normalized["finding_detected"] = bool(data.get("finding_detected", False))
    normalized["finding_confidence"] = data.get("finding_confidence", "low")

    finding = data.get("finding")
    if isinstance(finding, dict):
        normalized["finding"] = {
            "title": finding.get("title", ""),
            "severity": finding.get("severity", "Low"),
            "description": finding.get("description", ""),
            "evidence": finding.get("evidence", ""),
        }
    else:
        normalized["finding"] = None

    return normalized


def _filter_response(command: str, output: str, response: dict, context: dict | None = None) -> dict:
    connectivity_override = _connectivity_guidance(command, output, context)
    if connectivity_override:
        return connectivity_override

    if _is_low_signal_command(command):
        return _low_signal_response(command, response.get("warning", ""), context)

    recon_override = _recon_finding(command, output, context)
    if recon_override:
        return recon_override

    if _is_unclear_output(output):
        fallback = _default_response(response.get("warning", ""), context)
        fallback.update(
            {
                "assessment": response.get("assessment", fallback["assessment"]),
                "phase": response.get("phase", fallback["phase"]),
                "explanation": "The output was too limited or unclear to support a reliable finding.",
                "security_relevance": "No strong security conclusion should be drawn from incomplete output.",
                "next_step": response.get("next_step") or fallback["next_step"],
                "learning_reinforcement": response.get("learning_reinforcement", ""),
            }
        )
        return fallback

    response["finding_detected"] = False
    response["finding_confidence"] = "low"
    response["finding"] = None
    return response


def _count_recent_primary_command_matches(command: str, context: dict | None = None) -> int:
    primary_command = _extract_primary_command(command)
    if not primary_command or not context:
        return 0

    matches = 0
    for item in context.get("recent_commands", [])[-5:]:
        if _extract_primary_command(item.get("command", "")) == primary_command:
            matches += 1
    return matches


def _derive_tutor_state(command: str, output: str, context: dict | None = None) -> dict:
    context = context or {}
    step_type = context.get("step_type") or ""
    step_task_id = context.get("step_task_id")
    lab_id = context.get("lab_id")
    step_command_hint = context.get("step_command_hint") or ""
    next_step_action = context.get("next_step_action") or ""
    ask_intent_meta = _normalize_tutor_intent(context.get("ask_intent"))
    ask_intent = ask_intent_meta["key"] if context.get("ask_intent") else ""
    idle_observer_request = ask_intent == "idle_nudge"
    explicit_help_request = (
        (bool(ask_intent) and not idle_observer_request)
        or _is_help_request_command(command)
    )
    repeated_primary_command_count = _count_recent_primary_command_matches(command, context)
    repeated_same_action = repeated_primary_command_count >= 2
    prior_help_requests = _safe_int(context.get("step_help_requests"))
    prior_off_track_count = _safe_int(context.get("step_off_track_count"))
    prior_struggle_count = _safe_int(context.get("step_consecutive_struggle_count"))

    current_step_match = bool(
        step_command_hint and command_matches_hint(command, step_command_hint)
    )
    jumped_ahead = bool(
        next_step_action
        and not current_step_match
        and command_matches_hint(command, next_step_action)
    )

    evaluation = None
    evaluation_status = ""
    if (
        step_type == "command"
        and step_task_id
        and lab_id
        and not explicit_help_request
    ):
        evaluation = evaluate_task_attempt(lab_id, step_task_id, command, output)
        evaluation_status = evaluation.get("status", "")

    off_track_detected = False
    off_track_reason = ""

    if step_type == "browser" and not explicit_help_request:
        off_track_detected = True
        off_track_reason = "browser_step"
    elif jumped_ahead:
        off_track_detected = True
        off_track_reason = "jumped_ahead"
    elif evaluation_status == "off_track":
        off_track_detected = True
        off_track_reason = "step_mismatch"

    attempt_needs_evidence = evaluation_status == "attempted"
    step_completed = evaluation_status == "completed"
    struggle_signal = explicit_help_request or off_track_detected or attempt_needs_evidence

    if step_completed:
        consecutive_struggle_count = 0
    elif struggle_signal:
        consecutive_struggle_count = prior_struggle_count + 1
    else:
        consecutive_struggle_count = 0

    help_requests = prior_help_requests + (1 if explicit_help_request else 0)
    off_track_count = prior_off_track_count + (1 if off_track_detected else 0)
    hint_level = 0

    if not step_completed:
        if explicit_help_request or off_track_detected:
            hint_level = max(
                1,
                min(3, max(help_requests, off_track_count, consecutive_struggle_count)),
            )
        elif idle_observer_request:
            if attempt_needs_evidence:
                hint_level = 1

            if prior_help_requests >= 1 or prior_off_track_count >= 1:
                hint_level = max(hint_level, 2)

            if prior_help_requests >= 2 or prior_off_track_count >= 2:
                hint_level = 3

            if hint_level == 0:
                hint_level = 1
        elif attempt_needs_evidence and repeated_same_action:
            hint_level = 2
        elif attempt_needs_evidence and consecutive_struggle_count >= 1:
            hint_level = 1

        if help_requests >= 3 or off_track_count >= 3 or consecutive_struggle_count >= 3:
            hint_level = 3

        if ask_intent and not idle_observer_request:
            hint_level = max(hint_level, ask_intent_meta["min_hint_level"])

    stuck_detected = bool(
        not step_completed
        and (
            hint_level >= 2
            or consecutive_struggle_count >= 2
            or repeated_same_action
        )
    )

    if step_completed:
        tutor_mode = "success_explanation"
    elif off_track_detected:
        tutor_mode = "redirect"
    elif hint_level >= 3:
        tutor_mode = "near_complete_guidance"
    elif hint_level == 2:
        tutor_mode = "strong_hint"
    elif hint_level == 1:
        tutor_mode = "subtle_hint"
    else:
        tutor_mode = "observation"

    teaching_focus = (
        context.get("step_objective")
        or context.get("step_instruction")
        or context.get("step_explanation")
        or "Stay aligned with the current lab objective."
    )

    return {
        "step_completed": step_completed,
        "attempt_needs_evidence": attempt_needs_evidence,
        "current_step_match": current_step_match,
        "jumped_ahead": jumped_ahead,
        "explicit_help_request": explicit_help_request,
        "help_requests": help_requests,
        "off_track_detected": off_track_detected,
        "off_track_count": off_track_count,
        "off_track_reason": off_track_reason,
        "consecutive_struggle_count": consecutive_struggle_count,
        "repeated_same_action": repeated_same_action,
        "hint_level": hint_level,
        "hint_label": HINT_LABELS[hint_level],
        "tutor_mode": tutor_mode,
        "stuck_detected": stuck_detected,
        "teaching_focus": teaching_focus,
        "evaluation": evaluation,
        "ask_intent": ask_intent or None,
        "ask_label": ask_intent_meta["label"] if ask_intent else "",
        "teaching_style": ask_intent_meta["teaching_style"] if ask_intent else "",
    }


def _build_step_importance(context: dict | None) -> str:
    if not context:
        return "Stay aligned with the active lab objective and gather the evidence it expects."

    step_explanation = (context.get("step_explanation") or "").strip()
    step_objective = (context.get("step_objective") or "").strip()
    observation_significance = (context.get("step_why_observation_matters") or "").strip()
    expected_outcome = _format_expected_outcome(context)

    if observation_significance and step_explanation:
        return f"{step_explanation} Pay attention to the key signal here because {observation_significance.lower()}."

    if observation_significance:
        return observation_significance

    if step_explanation and step_objective:
        return f"{step_explanation} This step matters because the lab objective is to {step_objective.lower()}."

    if step_explanation:
        return step_explanation

    if step_objective and expected_outcome:
        return (
            f"This step matters because you are trying to {step_objective.lower()} "
            f"and prove that {expected_outcome.lower()}."
        )

    return step_objective or "Stay aligned with the current lab objective."


def _with_companion_lead(text: str, lead: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return lead.rstrip(" :,.")

    lead_root = lead.strip().rstrip(":,.").lower()
    if cleaned.lower().startswith(lead_root):
        return cleaned

    if len(cleaned) > 1 and cleaned[0].isupper() and not cleaned[1].isupper():
        cleaned = cleaned[0].lower() + cleaned[1:]

    return f"{lead}{cleaned}"


def _build_progress_briefing_explanation(context: dict | None) -> str:
    step_title = (context or {}).get("step_title") or "this step"
    expected_outcome = _format_expected_outcome(context)
    observation_focus = _format_observation_focus(context, limit=2, item_limit=90)

    if expected_outcome and observation_focus != "No authored observation focus available.":
        return (
            f"Good direction on {step_title}. You are using the right move, "
            f"but you still need evidence that {expected_outcome.lower()}. "
            f"Pay attention to {observation_focus.lower()}."
        )

    if expected_outcome:
        return (
            f"Good direction on {step_title}. You are using the right move, "
            f"but you still need evidence that {expected_outcome.lower()}."
        )

    return (
        f"Good direction on {step_title}. You are working on the right move, "
        "but you still need a clearer piece of evidence before this step is closed."
    )


def _build_success_brief(response: dict, context: dict | None) -> str:
    existing = (response.get("explanation") or "").strip()
    if existing:
        return _with_companion_lead(existing, "Good, ")

    step_title = (context or {}).get("step_title") or "that step"
    return f"Good, that closes {step_title.lower()}."


def _build_idle_brief(response: dict) -> str:
    existing = (response.get("explanation") or "").strip()
    if existing:
        return _with_companion_lead(existing, "Quick check-in: ")

    return "Quick check-in: you have been quiet on the current step for a bit."


def _build_redirect_brief(response: dict) -> str:
    existing = (response.get("explanation") or "").strip()
    if existing:
        return _with_companion_lead(existing, "Let's reset: ")

    return "Let's reset: that move is not lining up with the current step."


def _build_stuck_brief(response: dict) -> str:
    existing = (response.get("explanation") or "").strip()
    if existing:
        return _with_companion_lead(existing, "Let's tighten it up: ")

    return "Let's tighten it up: you are close, but the step still needs clearer evidence."


def _build_idle_nudge_response(context: dict | None, tutor_state: dict) -> dict:
    step_title = (context or {}).get("step_title") or "the current step"
    step_objective = (context or {}).get("step_objective") or (context or {}).get(
        "step_instruction"
    )
    step_explanation = (context or {}).get("step_explanation") or ""
    step_type = (context or {}).get("step_type") or ""
    browser_url = (context or {}).get("browser_url") or ""
    expected_outcome = _format_expected_outcome(context)
    observation_coaching = _build_observation_coaching(context)

    response = _default_response(context=context)
    response["response_origin"] = "proactive_tutor"
    response["ask_intent"] = "idle_nudge"
    response["ask_label"] = "Tutor check-in"
    response["response_mode"] = "fast"

    if step_type == "browser":
        response["explanation"] = (
            f"You have been sitting on {step_title} for a bit. This one is better handled in the browser, not the shell."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            step_explanation
            or "This handoff matters because the lab now wants application behavior, not another terminal command."
        )
        response["next_step"] = (
            f"Open {browser_url} and confirm the application behavior this step expects."
            if browser_url
            else "Open the forwarded browser URL and confirm the application behavior this step expects."
        )
        return response

    if tutor_state.get("stuck_detected") or tutor_state.get("hint_level", 0) >= 2:
        response["explanation"] = (
            f"You have been quiet on {step_title} for a bit. I can narrow the next move without dumping the whole answer."
        )
    else:
        response["explanation"] = (
            f"You have been quiet on {step_title} for a bit. Stay with the evidence this step still needs."
        )

    response["security_relevance"] = _build_step_importance(context)
    response["learning_reinforcement"] = (
        f"The goal is to gather evidence that shows {expected_outcome.lower()}."
        if expected_outcome
        else step_explanation or step_objective or ""
    )
    if observation_coaching:
        response["learning_reinforcement"] = (
            f"{response['learning_reinforcement']} {observation_coaching}".strip()
        )
    response["next_step"] = _build_adaptive_next_step(context, tutor_state)
    return response


def _build_tutor_request_response(context: dict | None, tutor_state: dict) -> dict:
    ask_intent = tutor_state.get("ask_intent")
    ask_label = tutor_state.get("ask_label") or "Give me a hint"
    step_title = (context or {}).get("step_title") or "the current step"
    step_objective = (context or {}).get("step_objective") or (context or {}).get(
        "step_instruction"
    )
    step_expected_outcome = _format_expected_outcome(context)
    step_hint = (context or {}).get("step_hint") or ""
    step_explanation = (context or {}).get("step_explanation") or ""
    observation_coaching = _build_observation_coaching(context)

    response = _default_response(context=context)
    response["response_origin"] = "ask_tutor"
    response["ask_intent"] = ask_intent
    response["ask_label"] = ask_label

    if ask_intent == "idle_nudge":
        return _build_idle_nudge_response(context, tutor_state)

    if ask_intent == "explain":
        response["explanation"] = (
            f"{step_title} depends on proving the current condition first, then moving deeper."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            f"Once you can show {step_expected_outcome.lower()}, "
            "the rest of the lab has a stronger evidence trail."
            if step_expected_outcome
            else step_explanation or step_objective or ""
        )
        if observation_coaching:
            response["learning_reinforcement"] = (
                f"{response['learning_reinforcement']} {observation_coaching}".strip()
            )
        response["next_step"] = (
            step_hint
            or step_objective
            or "Focus on the evidence this step expects before moving forward."
        )
        return response

    if ask_intent == "stuck":
        response["explanation"] = (
            "You are stuck, so I am moving up the hint ladder without jumping straight to the full answer."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            "The goal is to unblock the current step while keeping the reasoning visible enough for you to learn from it."
        )
        if observation_coaching:
            response["learning_reinforcement"] = (
                f"{response['learning_reinforcement']} {observation_coaching}".strip()
            )
        response["next_step"] = (
            step_hint
            or step_objective
            or "Refocus on the evidence this step expects and the tool most likely to produce it."
        )
        return response

    if ask_intent == "what_next":
        response["explanation"] = (
            "Stay with the current step until you have the evidence it expects."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            f"The next action should help you prove that {step_expected_outcome.lower()}."
            if step_expected_outcome
            else step_explanation or step_objective or ""
        )
        if observation_coaching:
            response["learning_reinforcement"] = (
                f"{response['learning_reinforcement']} {observation_coaching}".strip()
            )
        response["next_step"] = (
            step_hint
            or step_objective
            or "Take the next evidence-gathering action for the active step."
        )
        return response

    response["explanation"] = (
        "Narrow the problem without jumping straight to the final answer."
    )
    response["security_relevance"] = _build_step_importance(context)
    response["learning_reinforcement"] = (
        f"Focus on what would prove that {step_expected_outcome.lower()}."
        if step_expected_outcome
        else step_explanation or step_objective or ""
    )
    if observation_coaching:
        response["learning_reinforcement"] = (
            f"{response['learning_reinforcement']} {observation_coaching}".strip()
        )
    response["next_step"] = (
        step_hint
        or step_objective
        or "Focus on the evidence the active step expects."
    )
    return response


def _build_tutor_chat_response(
    learner_message: str, context: dict | None, tutor_state: dict
) -> dict:
    ask_intent = tutor_state.get("ask_intent")
    ask_label = tutor_state.get("ask_label") or "Tutor help"
    step_title = (context or {}).get("step_title") or "the current step"
    step_objective = (context or {}).get("step_objective") or (context or {}).get(
        "step_instruction"
    )
    step_explanation = (context or {}).get("step_explanation") or ""
    step_hint = (context or {}).get("step_hint") or ""
    expected_outcome = _format_expected_outcome(context)
    learner_question = (learner_message or "").strip()
    browser_url = (context or {}).get("browser_url") or ""
    step_type = (context or {}).get("step_type") or ""
    observation_coaching = _build_observation_coaching(context)

    response = _default_response(context=context)
    response["response_origin"] = "tutor_chat"
    response["ask_intent"] = ask_intent
    response["ask_label"] = ask_label
    response["learner_message"] = learner_question

    if step_type == "browser":
        response["explanation"] = (
            f"This step has moved out of the shell. Use the browser for {step_title} and verify the behavior there."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            step_explanation
            or "Browser validation matters because it confirms the application-side behavior the lab wants you to observe."
        )
        response["next_step"] = (
            f"Open {browser_url} and confirm the expected application behavior."
            if browser_url
            else "Open the forwarded browser URL and confirm the expected application behavior."
        )
        return response

    if ask_intent == "explain":
        response["explanation"] = (
            f"For {step_title}, prove the current condition before you move on to the deeper action."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            f"When this step is complete, you should be able to show that {expected_outcome.lower()}."
            if expected_outcome
            else step_explanation or step_objective or ""
        )
        if observation_coaching:
            response["learning_reinforcement"] = (
                f"{response['learning_reinforcement']} {observation_coaching}".strip()
            )
        response["next_step"] = (
            step_hint
            or step_objective
            or "Focus on the concrete evidence the current step expects."
        )
        return response

    if ask_intent == "what_next":
        response["explanation"] = (
            "The best next move is still the one that proves the current step before the lab advances."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            f"The next action should produce evidence that {expected_outcome.lower()}."
            if expected_outcome
            else step_explanation or step_objective or ""
        )
        if observation_coaching:
            response["learning_reinforcement"] = (
                f"{response['learning_reinforcement']} {observation_coaching}".strip()
            )
        response["next_step"] = (
            step_hint
            or step_objective
            or "Take the next evidence-gathering action for the active step."
        )
        return response

    if ask_intent == "stuck":
        response["explanation"] = (
            f"Stay on {step_title} and focus on one piece of evidence at a time."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            "The tutor is escalating support because repeated struggle usually means the step needs a clearer evidence target, not just another random command."
        )
        if observation_coaching:
            response["learning_reinforcement"] = (
                f"{response['learning_reinforcement']} {observation_coaching}".strip()
            )
        response["next_step"] = (
            step_hint
            or step_objective
            or "Refocus on the evidence this step expects and the tool most likely to produce it."
        )
        return response

    response["explanation"] = (
        "I will keep this light first so you can still reason through the step yourself."
    )
    response["security_relevance"] = _build_step_importance(context)
    response["learning_reinforcement"] = (
        f"Keep aiming for evidence that shows {expected_outcome.lower()}."
        if expected_outcome
        else step_explanation or step_objective or ""
    )
    if observation_coaching:
        response["learning_reinforcement"] = (
            f"{response['learning_reinforcement']} {observation_coaching}".strip()
        )
    response["next_step"] = (
        step_hint
        or step_objective
        or "Focus on the evidence the active step expects."
    )
    return response


def _is_deep_tutor_moment(
    intent: str | None,
    context: dict | None,
    learner_message: str,
) -> bool:
    normalized_intent = (intent or "").strip().lower()
    if normalized_intent in OPENAI_DEEP_TUTOR_INTENTS:
        return True

    message = (learner_message or "").strip().lower()
    if not message:
        return False

    lab_complete = bool(
        (context or {}).get("step_status") == "completed"
        and not (context or {}).get("step_task_id")
    )

    if lab_complete and any(
        marker in message for marker in ("debrief", "reflect", "summary", "learned")
    ):
        return True

    if len(message) >= 90:
        return True

    return any(marker in message for marker in OPENAI_DEEP_MESSAGE_MARKERS)


def _should_use_openai_tutor(
    intent: str | None,
    context: dict | None,
    learner_message: str,
) -> bool:
    if not settings.openai_tutor_enabled:
        return False

    return _is_deep_tutor_moment(intent, context, learner_message)


def _merge_openai_tutor_response(
    local_response: dict,
    openai_response: dict | None,
) -> tuple[dict, bool]:
    if not openai_response:
        return local_response, False

    merged = dict(local_response)
    applied = False
    for field in OPENAI_TUTOR_FIELDS:
        value = openai_response.get(field)
        if isinstance(value, str) and value.strip():
            merged[field] = value.strip()
            applied = True

    if applied:
        merged["deep_reasoning_provider"] = "openai"
        merged["openai_model"] = settings.openai_model

    return merged, applied


def _format_expected_outcome(context: dict | None) -> str:
    if not context:
        return ""

    expected_outcome = (context.get("step_expected_outcome") or "").strip()
    if expected_outcome:
        return expected_outcome

    success_criteria = context.get("step_success_criteria") or []
    if success_criteria:
        return success_criteria[0]

    expected_evidence = context.get("step_expected_evidence") or []
    if expected_evidence:
        return ", ".join(expected_evidence)

    return ""


def _build_step_strategy_hint(context: dict | None) -> str:
    if not context:
        return "Use the guided lab instructions to capture the evidence this step expects."

    step_type = context.get("step_type")
    if step_type == "browser":
        browser_url = context.get("browser_url")
        if browser_url:
            return f"Open the forwarded browser URL {browser_url} and confirm the application loads."
        return "Leave the shell for this step and use the forwarded browser URL from the lab runtime."

    step_command_hint = context.get("step_command_hint") or ""
    primary_tool = _extract_primary_command(step_command_hint)
    expected_outcome = _format_expected_outcome(context)

    if primary_tool == "ping":
        return "Use `ping` against the `target` hostname with a small probe count and look for successful replies with zero packet loss."
    if primary_tool == "nmap":
        return "Use `nmap` with version detection against `target` so the output reveals the open service details this step expects."
    if primary_tool == "curl":
        return "Use `curl` against the target web service and capture enough of the response to identify the application."
    if primary_tool:
        return (
            f"Use `{primary_tool}` to gather evidence for the current step"
            + (f": {expected_outcome}" if expected_outcome else ".")
        )

    return (
        f"Focus on producing evidence that shows {expected_outcome}."
        if expected_outcome
        else "Focus on producing evidence that satisfies the current step objective."
    )


def _build_level_one_hint(context: dict | None) -> str:
    if not context:
        return "Stay with the current lab objective and think about what evidence would prove the step is complete."

    step_hint = (context.get("step_hint") or "").strip()
    if step_hint and step_hint != context.get("step_command_hint"):
        return step_hint

    expected_outcome = _format_expected_outcome(context)
    if expected_outcome:
        return (
            "Focus on the evidence, not the exact syntax yet: "
            f"what output would prove that {expected_outcome.lower()}"
        )

    return (
        context.get("step_objective")
        or context.get("step_instruction")
        or "Stay with the current step objective."
    )


def _build_level_two_hint(context: dict | None) -> str:
    if not context:
        return "Use the tool and evidence direction from the current guide step to narrow the problem."

    hints = context.get("step_hints") or []
    if hints:
        first_hint = hints[0]
        if first_hint and first_hint != context.get("step_command_hint"):
            return f"{first_hint} {_build_step_strategy_hint(context)}".strip()

    return _build_step_strategy_hint(context)


def _build_level_three_hint(context: dict | None) -> str:
    if not context:
        return "Use the exact guided lab action from the current step and capture the output it asks for."

    step_type = context.get("step_type")
    step_command_hint = context.get("step_command_hint") or ""
    expected_outcome = _format_expected_outcome(context)
    browser_url = context.get("browser_url")

    if step_type == "browser":
        if browser_url:
            return (
                f"Open {browser_url} and confirm the application loads. "
                "After that, use the guide or reports view to capture what you observed."
            )
        return "Use the browser URL returned by the lab runtime and confirm the application loads."

    if step_command_hint:
        if expected_outcome:
            return f"Run `{step_command_hint}` and confirm the output shows {expected_outcome}."
        return f"Run `{step_command_hint}` and capture the evidence the step expects."

    return _build_level_two_hint(context)


def _build_adaptive_next_step(context: dict | None, tutor_state: dict) -> str:
    if tutor_state["step_completed"]:
        return _contextual_follow_up_step(context)

    level = tutor_state["hint_level"]
    if level <= 1:
        return _build_level_one_hint(context)
    if level == 2:
        return _build_level_two_hint(context)
    return _build_level_three_hint(context)


def _build_learning_reinforcement(context: dict | None, tutor_state: dict) -> str:
    if not context:
        return ""

    step_learning_takeaway = context.get("step_learning_takeaway") or ""
    step_objective = context.get("step_objective") or context.get("step_instruction") or ""
    expected_outcome = _format_expected_outcome(context)
    step_explanation = context.get("step_explanation") or ""
    observation_focus = _format_observation_focus(context, limit=2, item_limit=90)
    observation_significance = (context.get("step_why_observation_matters") or "").strip()

    if tutor_state["step_completed"]:
        if step_learning_takeaway:
            return step_learning_takeaway
        if observation_focus != "No authored observation focus available." and observation_significance:
            return (
                f"Noticing {observation_focus.lower()} mattered because {observation_significance.lower()}."
            )
        if expected_outcome and step_objective:
            return (
                f"This result shows {expected_outcome.lower()}. "
                f"It matters to the lab objective because you must {step_objective.lower()}."
            )
        return step_explanation or step_objective

    if tutor_state["off_track_detected"]:
        if step_objective:
            return f"Stay centered on the current objective: {step_objective}"
        return step_learning_takeaway or observation_significance or step_explanation

    if expected_outcome:
        if observation_focus != "No authored observation focus available.":
            return (
                f"The evidence you still need for this step is: {expected_outcome}. "
                f"Focus on {observation_focus.lower()}."
            )
        return f"The evidence you still need for this step is: {expected_outcome}"

    return (
        step_learning_takeaway
        or observation_significance
        or step_explanation
        or step_objective
    )


def _build_redirect_explanation(command: str, context: dict | None, tutor_state: dict) -> str:
    if not context:
        return f"`{command}` is not aligned with the current lab step."

    if tutor_state["off_track_reason"] == "browser_step":
        return "The current step has moved out of the terminal, so additional shell commands will not satisfy it."

    if tutor_state["off_track_reason"] == "jumped_ahead":
        return "This command jumps ahead of the current task instead of validating the evidence the guide is asking for first."

    step_title = context.get("step_title") or "the current step"
    return f"`{command}` does not match the evidence-gathering goal for {step_title}."


def _build_redirect_warning(context: dict | None, tutor_state: dict) -> str:
    if not context:
        return "Return to the current guided objective before moving forward."

    if tutor_state["off_track_reason"] == "browser_step":
        return (
            context.get("step_remediation")
            or "This step is satisfied outside the terminal. Use the forwarded browser URL instead."
        )

    if tutor_state["off_track_reason"] == "jumped_ahead":
        return "You are moving ahead of the guide. Finish the current validation first so your evidence trail stays clear."

    return (
        context.get("step_remediation")
        or "The current command is not aligned with the active step."
    )


def _get_intervention_reason(
    command: str, context: dict | None, tutor_state: dict
) -> str:
    if tutor_state["ask_intent"] == "idle_nudge":
        return "idle_nudge"

    if tutor_state["explicit_help_request"]:
        return ""

    if (
        _is_low_signal_command(command)
        and tutor_state["off_track_reason"] != "browser_step"
        and not tutor_state["step_completed"]
    ):
        return ""

    if tutor_state["step_completed"]:
        return "success_reinforcement"

    if tutor_state["off_track_detected"]:
        if tutor_state["off_track_reason"] == "browser_step":
            return "browser_handoff_guidance"
        return "off_track_redirect"

    if (
        tutor_state["attempt_needs_evidence"]
        and tutor_state["current_step_match"]
        and not tutor_state["stuck_detected"]
    ):
        return "progress_briefing"

    if tutor_state["stuck_detected"] or (
        tutor_state["attempt_needs_evidence"] and tutor_state["hint_level"] >= 2
    ):
        return "stuck_intervention"

    return ""


def _build_intervention_key(
    context: dict | None, tutor_state: dict, intervention_reason: str
) -> str:
    if not intervention_reason:
        return ""

    step_task_id = (context or {}).get("step_task_id") or "no-step"
    if intervention_reason in {
        "success_reinforcement",
        "browser_handoff_guidance",
        "progress_briefing",
    }:
        return f"{intervention_reason}:{step_task_id}"

    hint_bucket = min(max(tutor_state.get("hint_level", 1), 1), 3)
    return f"{intervention_reason}:{step_task_id}:{hint_bucket}"


def _apply_teaching_strategy(
    response: dict,
    command: str,
    output: str,
    context: dict | None,
    tutor_state: dict,
) -> dict:
    enriched = dict(response)
    intervention_reason = _get_intervention_reason(command, context, tutor_state)
    proactive_intervention = bool(intervention_reason)
    response_origin = response.get("response_origin") or (
        "ask_tutor" if tutor_state["ask_intent"] else "command_review"
    )
    if proactive_intervention and response_origin == "command_review":
        response_origin = "proactive_tutor"
    response_mode = _get_response_mode(tutor_state, response)

    enriched["hint_level"] = tutor_state["hint_level"]
    enriched["hint_label"] = tutor_state["hint_label"]
    enriched["tutor_mode"] = tutor_state["tutor_mode"]
    enriched["teaching_focus"] = tutor_state["teaching_focus"]
    enriched["help_request_detected"] = tutor_state["explicit_help_request"]
    enriched["help_requests"] = tutor_state["help_requests"]
    enriched["off_track_detected"] = tutor_state["off_track_detected"]
    enriched["stuck_detected"] = tutor_state["stuck_detected"]
    enriched["step_completed_detected"] = tutor_state["step_completed"]
    enriched["ask_intent"] = tutor_state["ask_intent"]
    enriched["ask_label"] = tutor_state["ask_label"]
    enriched["response_origin"] = response_origin
    enriched["proactive_intervention"] = proactive_intervention
    enriched["intervention_reason"] = intervention_reason
    enriched["intervention_label"] = INTERVENTION_LABELS.get(
        intervention_reason, ""
    )
    enriched["intervention_key"] = _build_intervention_key(
        context, tutor_state, intervention_reason
    )
    enriched["should_append_to_chat"] = bool(
        response_origin in {"ask_tutor", "tutor_chat"} or proactive_intervention
    )
    enriched["response_mode"] = response_mode
    enriched["learning_reinforcement"] = (
        enriched.get("learning_reinforcement")
        or _build_learning_reinforcement(context, tutor_state)
    )

    if tutor_state["step_completed"]:
        enriched["assessment"] = "useful"
        enriched["explanation"] = _build_success_brief(enriched, context)
        enriched["next_step"] = _contextual_follow_up_step(context)
        return _apply_response_length_limits(enriched, response_mode)

    adaptive_next_step = _build_adaptive_next_step(context, tutor_state)

    if tutor_state["explicit_help_request"]:
        enriched["assessment"] = enriched.get("assessment") or "neutral"
        enriched["phase"] = enriched.get("phase") or PHASE_BY_STEP_TYPE.get(
            (context or {}).get("step_type"),
            "general-navigation",
        )
        enriched["explanation"] = enriched.get("explanation") or (
            "You asked for help on the current step, so the tutor is escalating guidance without immediately jumping to the full answer."
        )
        enriched["security_relevance"] = enriched.get("security_relevance") or (
            (context or {}).get("step_explanation")
            or (context or {}).get("step_objective")
            or enriched["security_relevance"]
        )
        if ask_intent := tutor_state.get("ask_intent"):
            if ask_intent == "explain":
                enriched["explanation"] = _with_companion_lead(
                    enriched["explanation"],
                    "Here's the idea: ",
                )
            elif ask_intent == "what_next":
                enriched["explanation"] = _with_companion_lead(
                    enriched["explanation"],
                    "Next move: ",
                )
            elif ask_intent == "stuck":
                enriched["explanation"] = _with_companion_lead(
                    enriched["explanation"],
                    "Let's narrow it down: ",
                )
            else:
                enriched["explanation"] = _with_companion_lead(
                    enriched["explanation"],
                    "Light hint: ",
                )
        enriched["next_step"] = adaptive_next_step
        enriched["finding_detected"] = False
        enriched["finding_confidence"] = "low"
        enriched["finding"] = None
        return _apply_response_length_limits(enriched, response_mode)

    if tutor_state["ask_intent"] == "idle_nudge":
        enriched["assessment"] = enriched.get("assessment") or "neutral"
        enriched["phase"] = enriched.get("phase") or PHASE_BY_STEP_TYPE.get(
            (context or {}).get("step_type"),
            "general-navigation",
        )
        enriched["explanation"] = _build_idle_brief(enriched)
        enriched["finding_detected"] = False
        enriched["finding_confidence"] = "low"
        enriched["finding"] = None
        return _apply_response_length_limits(enriched, response_mode)

    if tutor_state["off_track_detected"]:
        enriched["assessment"] = "incorrect"
        enriched["phase"] = PHASE_BY_STEP_TYPE.get(
            (context or {}).get("step_type"),
            enriched.get("phase", "general-navigation"),
        )
        enriched["explanation"] = _build_redirect_explanation(
            command, context, tutor_state
        )
        enriched["explanation"] = _build_redirect_brief(enriched)
        enriched["security_relevance"] = (
            (context or {}).get("step_objective")
            or (context or {}).get("step_explanation")
            or enriched["security_relevance"]
        )
        enriched["next_step"] = adaptive_next_step
        enriched["warning"] = _build_redirect_warning(context, tutor_state)
        enriched["finding_detected"] = False
        enriched["finding_confidence"] = "low"
        enriched["finding"] = None
        return _apply_response_length_limits(enriched, response_mode)

    if tutor_state["attempt_needs_evidence"] or tutor_state["hint_level"] > 0:
        enriched["next_step"] = adaptive_next_step
        if tutor_state["attempt_needs_evidence"]:
            enriched["explanation"] = _build_progress_briefing_explanation(context)
            if intervention_reason == "stuck_intervention":
                enriched["explanation"] = _build_stuck_brief(enriched)
        return _apply_response_length_limits(enriched, response_mode)

    return _apply_response_length_limits(enriched, response_mode)


def analyze_terminal_interaction(command: str, output: str, context: dict | None = None) -> dict:
    tutor_state = _derive_tutor_state(command, output, context)

    connectivity_override = _connectivity_guidance(command, output, context)
    if connectivity_override:
        return _apply_teaching_strategy(
            connectivity_override,
            command,
            output,
            context,
            tutor_state,
        )

    if tutor_state["explicit_help_request"]:
        return _apply_teaching_strategy(
            _default_response(context=context),
            command,
            output,
            context,
            tutor_state,
        )

    if _is_low_signal_command(command):
        return _apply_teaching_strategy(
            _low_signal_response(command, context=context),
            command,
            output,
            context,
            tutor_state,
        )

    if tutor_state["off_track_detected"]:
        return _apply_teaching_strategy(
            _default_response(context=context),
            command,
            output,
            context,
            tutor_state,
        )

    recon_override = _recon_finding(command, output, context)
    if recon_override:
        return _apply_teaching_strategy(
            recon_override,
            command,
            output,
            context,
            tutor_state,
        )

    if tutor_state["step_completed"] or tutor_state["attempt_needs_evidence"]:
        return _apply_teaching_strategy(
            _default_response(context=context),
            command,
            output,
            context,
            tutor_state,
        )

    if _is_unclear_output(output):
        return _apply_teaching_strategy(
            _default_response(context=context),
            command,
            output,
            context,
            tutor_state,
        )

    prompt = build_terminal_prompt(
        command,
        output,
        context,
        tutor_state,
        mode="fast",
    )

    try:
        response = requests.post(
            settings.ollama_url,
            json={
                "model": settings.ollama_model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=min(settings.ollama_timeout_seconds, 12.0),
        )
        response.raise_for_status()
        raw = response.json().get("response", "{}")
        cleaned = _extract_json(raw)

        try:
            parsed = json.loads(cleaned)
            normalized = _normalize_response(parsed, context)
            filtered = _filter_response(command, output, normalized, context)
            return _apply_teaching_strategy(
                filtered,
                command,
                output,
                context,
                tutor_state,
            )
        except json.JSONDecodeError:
            recon_override = _recon_finding(command, output, context)
            fallback = recon_override or _default_response(raw, context)
            return _apply_teaching_strategy(
                fallback,
                command,
                output,
                context,
                tutor_state,
            )

    except requests.RequestException as exc:
        recon_override = _recon_finding(command, output, context)
        fallback = recon_override or _default_response(str(exc), context)
        return _apply_teaching_strategy(
            fallback,
            command,
            output,
            context,
            tutor_state,
        )


def analyze_tutor_request(
    intent: str,
    context: dict | None = None,
    learner_message: str = "",
    conversation_history: list[dict] | None = None,
) -> dict:
    normalized_intent = _normalize_tutor_intent(intent, learner_message)
    request_context = {
        **(context or {}),
        "ask_intent": normalized_intent["key"],
        "recent_tutor_messages": conversation_history
        or (context or {}).get("recent_tutor_messages")
        or [],
    }
    synthetic_command = learner_message.strip() or (
        normalized_intent["key"] if normalized_intent["key"] == "idle_nudge" else "help"
    )
    tutor_state = _derive_tutor_state(synthetic_command, "", request_context)
    response = (
        _build_tutor_chat_response(learner_message, request_context, tutor_state)
        if learner_message.strip()
        else _build_tutor_request_response(request_context, tutor_state)
    )

    if _should_use_openai_tutor(
        normalized_intent["key"],
        request_context,
        learner_message,
    ):
        openai_response = openai_tutor.ask_openai_tutor(
            normalized_intent["key"],
            request_context,
            learner_message,
            tutor_state,
        )
        response, used_openai = _merge_openai_tutor_response(response, openai_response)
        if not used_openai:
            response = {
                **response,
                "deep_reasoning_provider": "local_fallback",
                "deep_reasoning_fallback": True,
            }
            logger.info(
                "openai_tutor_fallback intent=%s lab_id=%s step_task_id=%s",
                normalized_intent["key"],
                request_context.get("lab_id"),
                request_context.get("step_task_id"),
            )

    return _apply_teaching_strategy(
        response,
        learner_message.strip() or normalized_intent["label"],
        "",
        request_context,
        tutor_state,
    )
