import json
import re
import shlex

import requests

from app.config import settings
from app.services.task_evaluator import command_matches_hint, evaluate_task_attempt

LOW_SIGNAL_PREFIXES = ("ping", "pwd", "ls")
HELP_COMMAND_PREFIXES = ("help", "hint", "stuck", "what next", "why", "how", "?")
HELP_COMMAND_MARKERS = ("--help", " -h", " man ", " explain ")
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


def _format_recent_commands(context: dict | None) -> str:
    if not context:
        return "No recent command history available."

    recent_commands = context.get("recent_commands") or []
    if not recent_commands:
        return "No recent command history available."

    lines = []
    for index, item in enumerate(recent_commands[-5:], start=1):
        command = _truncate(item.get("command", ""), 180)
        output = _truncate(item.get("output", ""), 320)
        assessment = item.get("assessment")
        hint_level = item.get("hint_level")
        notes = []
        if assessment:
            notes.append(f"assessment={assessment}")
        if item.get("off_track_detected"):
            notes.append("off_track")
        if item.get("help_request_detected"):
            notes.append("help_request")
        if hint_level:
            notes.append(f"hint_level={hint_level}")

        lines.append(f"{index}. Command: {command or '[missing]'}")
        if notes:
            lines.append(f"   Tutor notes: {', '.join(notes)}")
        if output:
            lines.append(f"   Output excerpt: {output}")

    return "\n".join(lines)


def _normalize_tutor_intent(intent: str | None) -> dict:
    normalized = (intent or "").strip().lower().replace("-", "_")
    if normalized in ASK_TUTOR_INTENTS:
        return {"key": normalized, **ASK_TUTOR_INTENTS[normalized]}

    return {"key": "hint", **ASK_TUTOR_INTENTS["hint"]}


def _build_context_block(context: dict | None, tutor_state: dict | None = None) -> str:
    if not context:
        return "No structured lab context was available for this command."

    lab_name = context.get("lab_name") or "Unknown lab"
    topology_summary = context.get("topology_summary") or "No topology summary available."
    objectives = context.get("lab_objectives") or []
    step_number = context.get("step_number")
    step_title = context.get("step_title") or "No active step"
    step_instruction = context.get("step_instruction") or "No active instruction available."
    step_explanation = context.get("step_explanation") or "No step explanation available."
    step_objective = context.get("step_objective") or "No step objective available."
    step_outcome = context.get("step_expected_outcome") or "No expected outcome recorded."
    step_hint = context.get("step_hint") or "No hint available."
    step_status = context.get("step_status") or "pending"
    step_expected_evidence = context.get("step_expected_evidence") or []
    step_success_criteria = context.get("step_success_criteria") or []
    step_remediation = context.get("step_remediation") or "No remediation guidance available."

    objective_lines = "\n".join(f"- {objective}" for objective in objectives[:3]) or "- None recorded"
    evidence_lines = (
        "\n".join(f"- {evidence}" for evidence in step_expected_evidence[:4])
        or "- None recorded"
    )
    success_lines = (
        "\n".join(f"- {criterion}" for criterion in step_success_criteria[:3])
        or "- None recorded"
    )
    tutor_state_lines = "\n".join(
        [
            f"- Help requests so far: {context.get('step_help_requests', 0)}",
            f"- Off-track redirects so far: {context.get('step_off_track_count', 0)}",
            f"- Consecutive struggle signals: {context.get('step_consecutive_struggle_count', 0)}",
            (
                f"- Current adaptive hint level: {tutor_state.get('hint_level', 0)}"
                if tutor_state
                else "- Current adaptive hint level: 0"
            ),
            (
                f"- Current ask intent: {tutor_state.get('ask_label', 'None')}"
                if tutor_state and tutor_state.get("ask_label")
                else "- Current ask intent: None"
            ),
        ]
    )

    return f"""
Lab:
{lab_name}

Lab objectives:
{objective_lines}

Topology summary:
{topology_summary}

Current guided step:
- Step number: {step_number or "Not set"}
- Title: {step_title}
- Objective: {step_objective}
- Instruction: {step_instruction}
- Explanation: {step_explanation}
- Expected outcome: {step_outcome}
- Hint: {step_hint}
- Current workflow status: {step_status}

Expected evidence:
{evidence_lines}

Success criteria:
{success_lines}

Remediation guidance:
{step_remediation}

Adaptive tutor state:
{tutor_state_lines}

Recent command history:
{_format_recent_commands(context)}
""".strip()


def build_terminal_prompt(
    command: str,
    output: str,
    context: dict | None = None,
    tutor_state: dict | None = None,
) -> str:
    return f"""
You are Secure Stack's AI cybersecurity lab tutor.

Analyze the learner's latest lab command using the current lab guide context.

Structured lab context:
{_build_context_block(context, tutor_state)}

Latest command:
{_truncate(command, 240)}

Latest output:
{_truncate(output, 3200)}

Adaptive teaching rules:
1. If the learner is asking for help or appears stuck, escalate guidance progressively:
   - hint level 1: subtle conceptual hint
   - hint level 2: stronger hint with tool or evidence direction
   - hint level 3: near-complete guidance
2. Do not reveal the exact command at level 1 unless the step is already complete.
3. If the learner is off-track, gently redirect them to the current step objective.
4. When the learner succeeds, explain why the result matters for the lab objective before moving on.
5. Prefer guided questions, evidence targets, and reasoning over answer-dumping.

Requirements:
1. Classify the phase as one of:
   - reconnaissance
   - enumeration
   - exploitation
   - post-exploitation
   - general-navigation
2. Assess the command as:
   - useful
   - neutral
   - risky
   - incorrect
3. Explain what the output means in the context of the current lab step.
4. Explain the security relevance and why this matters for the learner.
5. Suggest the next best step using the current adaptive hint level.
6. Only create a finding when the output contains strong, report-worthy evidence.

Tutor guardrails:
- Be instructional and concept-aware, not just evaluative.
- Help debug mistakes and explain why a step matters.
- Avoid handing out the full answer immediately unless the hint level allows it or the output already proves the concept.
- Do not create findings for ping, pwd, ls, or other low-signal navigation commands.
- Prefer false negatives over false positives for findings.
- If the output is weak or unclear, guide the learner back to the current objective.

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
    explicit_help_request = bool(ask_intent) or _is_help_request_command(command)
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
        elif attempt_needs_evidence and repeated_same_action:
            hint_level = 2
        elif attempt_needs_evidence and consecutive_struggle_count >= 1:
            hint_level = 1

        if help_requests >= 3 or off_track_count >= 3 or consecutive_struggle_count >= 3:
            hint_level = 3

        if ask_intent:
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
    expected_outcome = _format_expected_outcome(context)

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

    response = _default_response(context=context)
    response["response_origin"] = "ask_tutor"
    response["ask_intent"] = ask_intent
    response["ask_label"] = ask_label

    if ask_intent == "explain":
        response["explanation"] = (
            f"This step, {step_title}, is asking you to prove a specific concept before moving on."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            f"Once you can show {step_expected_outcome.lower()}, "
            "the rest of the lab has a stronger evidence trail."
            if step_expected_outcome
            else step_explanation or step_objective or ""
        )
        response["next_step"] = (
            step_hint
            or step_objective
            or "Focus on the evidence this step expects before moving forward."
        )
        return response

    if ask_intent == "stuck":
        response["explanation"] = (
            "You signaled that you are stuck, so the tutor is moving up the hint ladder without jumping straight to the full answer."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            "The goal is to unblock the current step while keeping the reasoning visible enough for you to learn from it."
        )
        response["next_step"] = (
            step_hint
            or step_objective
            or "Refocus on the evidence this step expects and the tool most likely to produce it."
        )
        return response

    if ask_intent == "what_next":
        response["explanation"] = (
            "You asked for the next move, so the tutor is pointing you toward the current step's evidence target first."
        )
        response["security_relevance"] = _build_step_importance(context)
        response["learning_reinforcement"] = (
            f"The next action should help you prove that {step_expected_outcome.lower()}."
            if step_expected_outcome
            else step_explanation or step_objective or ""
        )
        response["next_step"] = (
            step_hint
            or step_objective
            or "Take the next evidence-gathering action for the active step."
        )
        return response

    response["explanation"] = (
        "You asked for a hint, so the tutor is narrowing the problem without revealing the full answer yet."
    )
    response["security_relevance"] = _build_step_importance(context)
    response["learning_reinforcement"] = (
        f"Focus on what would prove that {step_expected_outcome.lower()}."
        if step_expected_outcome
        else step_explanation or step_objective or ""
    )
    response["next_step"] = (
        step_hint
        or step_objective
        or "Focus on the evidence the active step expects."
    )
    return response


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

    step_objective = context.get("step_objective") or context.get("step_instruction") or ""
    expected_outcome = _format_expected_outcome(context)
    step_explanation = context.get("step_explanation") or ""

    if tutor_state["step_completed"]:
        if expected_outcome and step_objective:
            return (
                f"This result satisfies the current step because it shows {expected_outcome.lower()}. "
                f"That matters because the lab objective is to {step_objective.lower()}."
            )
        return step_explanation or step_objective

    if tutor_state["off_track_detected"]:
        if step_objective:
            return f"Stay centered on the current objective: {step_objective}"
        return step_explanation

    if expected_outcome:
        return f"The evidence you still need for this step is: {expected_outcome}"

    return step_explanation or step_objective


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


def _apply_teaching_strategy(
    response: dict,
    command: str,
    output: str,
    context: dict | None,
    tutor_state: dict,
) -> dict:
    enriched = dict(response)
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
    enriched["response_origin"] = (
        "ask_tutor" if tutor_state["ask_intent"] else response.get("response_origin", "command_review")
    )
    enriched["learning_reinforcement"] = (
        enriched.get("learning_reinforcement")
        or _build_learning_reinforcement(context, tutor_state)
    )

    if tutor_state["step_completed"]:
        enriched["assessment"] = "useful"
        enriched["next_step"] = _contextual_follow_up_step(context)
        return enriched

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
        enriched["next_step"] = adaptive_next_step
        enriched["finding_detected"] = False
        enriched["finding_confidence"] = "low"
        enriched["finding"] = None
        return enriched

    if tutor_state["off_track_detected"]:
        enriched["assessment"] = "incorrect"
        enriched["phase"] = PHASE_BY_STEP_TYPE.get(
            (context or {}).get("step_type"),
            enriched.get("phase", "general-navigation"),
        )
        enriched["explanation"] = _build_redirect_explanation(
            command, context, tutor_state
        )
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
        return enriched

    if tutor_state["attempt_needs_evidence"] or tutor_state["hint_level"] > 0:
        enriched["next_step"] = adaptive_next_step
        if tutor_state["attempt_needs_evidence"]:
            expected_outcome = _format_expected_outcome(context)
            if expected_outcome:
                enriched["explanation"] = (
                    "The command is aimed at the right step, but the captured output does not yet prove "
                    f"{expected_outcome.lower()}."
                )
        return enriched

    return enriched


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

    if _is_unclear_output(output):
        recon_override = _recon_finding(command, output, context)
        if recon_override:
            return _apply_teaching_strategy(
                recon_override,
                command,
                output,
                context,
                tutor_state,
            )
        return _apply_teaching_strategy(
            _default_response(context=context),
            command,
            output,
            context,
            tutor_state,
        )

    prompt = build_terminal_prompt(command, output, context, tutor_state)

    try:
        response = requests.post(
            settings.ollama_url,
            json={
                "model": settings.ollama_model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=settings.ollama_timeout_seconds,
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


def analyze_tutor_request(intent: str, context: dict | None = None) -> dict:
    normalized_intent = _normalize_tutor_intent(intent)
    request_context = {
        **(context or {}),
        "ask_intent": normalized_intent["key"],
    }
    tutor_state = _derive_tutor_state("help", "", request_context)
    response = _build_tutor_request_response(request_context, tutor_state)
    return _apply_teaching_strategy(
        response,
        normalized_intent["label"],
        "",
        request_context,
        tutor_state,
    )
