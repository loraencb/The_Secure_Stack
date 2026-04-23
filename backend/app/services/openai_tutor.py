import json
import logging

from app.config import settings

logger = logging.getLogger("securestack.openai_tutor")

_missing_key_logged = False
_missing_sdk_logged = False

OPENAI_TUTOR_INSTRUCTIONS = """
You are Secure Stack's deep tutor layer for a cybersecurity lab.

Act like a concise live lab TA. Improve the learner's reasoning, but do not replace
the platform's step logic or hint ladder.

Rules:
- Stay focused on the active lab step and the learner's question.
- Keep the answer short, calm, and practical.
- Use the authored objective, expected outcome, hints, and observation cues.
- Do not dump a final command unless the provided hint level already implies it.
- Be honest when a step belongs in the browser instead of the shell.
- Do not invent lab topology, findings, vulnerabilities, commands, or results.
- Return only compact JSON with these string fields:
  explanation, security_relevance, learning_reinforcement, next_step, warning
""".strip()

OUTPUT_FIELD_LIMITS = {
    "explanation": 420,
    "security_relevance": 320,
    "learning_reinforcement": 360,
    "next_step": 260,
    "warning": 180,
}


def _truncate(value: str, limit: int) -> str:
    cleaned = (value or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}\n...[truncated]"


def _compact_list(values, limit: int = 3, item_limit: int = 160) -> list[str]:
    if not isinstance(values, list):
        return []

    compacted = []
    for value in values[:limit]:
        if isinstance(value, str) and value.strip():
            compacted.append(_truncate(value, item_limit))
    return compacted


def _compact_recent_commands(context: dict | None) -> list[dict]:
    commands = (context or {}).get("recent_commands") or []
    compacted = []
    for item in commands[-3:]:
        if not isinstance(item, dict):
            continue

        compacted.append(
            {
                "command": _truncate(str(item.get("command") or ""), 120),
                "output": _truncate(str(item.get("output") or ""), 220),
                "assessment": str(item.get("assessment") or "")[:40],
                "hint_level": item.get("hint_level", 0),
                "off_track": bool(item.get("off_track_detected")),
                "help_request": bool(item.get("help_request_detected")),
            }
        )
    return compacted


def _compact_recent_messages(context: dict | None) -> list[dict]:
    messages = (context or {}).get("recent_tutor_messages") or []
    compacted = []
    for item in messages[-4:]:
        if not isinstance(item, dict):
            continue

        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or "").strip()
        if not content:
            continue

        compacted.append(
            {
                "role": "student" if role in {"student", "user", "learner"} else "tutor",
                "content": _truncate(content, 180),
            }
        )
    return compacted


def _build_request_payload(
    intent: str,
    context: dict | None,
    learner_message: str,
    tutor_state: dict | None,
) -> dict:
    context = context or {}
    tutor_state = tutor_state or {}

    return {
        "learner_request": {
            "intent": intent,
            "message": _truncate(learner_message, 500),
        },
        "lab": {
            "id": context.get("lab_id") or "",
            "name": context.get("lab_name") or "",
            "objectives": _compact_list(context.get("lab_objectives"), limit=3),
            "topology_summary": _truncate(context.get("topology_summary") or "", 220),
            "reflection_prompt": _truncate(
                context.get("lab_reflection_prompt") or "",
                220,
            ),
            "takeaways": _compact_list(context.get("lab_takeaways"), limit=3),
        },
        "active_step": {
            "number": context.get("step_number"),
            "task_id": context.get("step_task_id") or "",
            "title": context.get("step_title") or "",
            "type": context.get("step_type") or "",
            "status": context.get("step_status") or "",
            "objective": _truncate(context.get("step_objective") or "", 240),
            "instruction": _truncate(context.get("step_instruction") or "", 240),
            "expected_outcome": _truncate(
                context.get("step_expected_outcome") or "",
                260,
            ),
            "expected_evidence": _compact_list(
                context.get("step_expected_evidence"),
                limit=4,
                item_limit=100,
            ),
            "hint": _truncate(context.get("step_hint") or "", 180),
            "observation_cues": _compact_list(
                context.get("step_what_to_observe"),
                limit=3,
                item_limit=120,
            ),
            "why_observation_matters": _truncate(
                context.get("step_why_observation_matters") or "",
                220,
            ),
            "browser_url": context.get("browser_url") or "",
        },
        "adaptive_state": {
            "hint_level": tutor_state.get("hint_level", 0),
            "tutor_mode": tutor_state.get("tutor_mode") or "",
            "help_requests": context.get("step_help_requests", 0),
            "off_track_count": context.get("step_off_track_count", 0),
            "struggle_count": context.get("step_consecutive_struggle_count", 0),
        },
        "recent_commands": _compact_recent_commands(context),
        "recent_tutor_messages": _compact_recent_messages(context),
    }


def _extract_response_text(response) -> str:
    output_text = getattr(response, "output_text", None)
    if output_text:
        return str(output_text)

    chunks = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                chunks.append(str(text))
    return "\n".join(chunks)


def _extract_json(text: str) -> dict | None:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.replace("```json", "").replace("```", "").strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        cleaned = cleaned[start : end + 1]

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return None

    return parsed if isinstance(parsed, dict) else None


def _normalize_openai_fields(data: dict | None) -> dict | None:
    if not data:
        return None

    normalized = {}
    for field, limit in OUTPUT_FIELD_LIMITS.items():
        value = data.get(field)
        if isinstance(value, str) and value.strip():
            normalized[field] = _truncate(value, limit)

    return normalized or None


def _model_supports_reasoning(model: str) -> bool:
    normalized = (model or "").lower()
    return normalized.startswith("gpt-5") or normalized.startswith("o")


def _model_supports_verbosity(model: str) -> bool:
    return (model or "").lower().startswith("gpt-5")


def _build_client():
    global _missing_sdk_logged

    try:
        from openai import OpenAI
    except ImportError:
        if not _missing_sdk_logged:
            logger.warning("openai_tutor_unavailable reason=missing_openai_sdk")
            _missing_sdk_logged = True
        return None

    client_kwargs = {
        "api_key": settings.openai_api_key,
        "timeout": settings.openai_timeout_seconds,
    }
    if settings.openai_org_id:
        client_kwargs["organization"] = settings.openai_org_id
    if settings.openai_project_id:
        client_kwargs["project"] = settings.openai_project_id

    return OpenAI(**client_kwargs)


def ask_openai_tutor(
    intent: str,
    context: dict | None,
    learner_message: str,
    tutor_state: dict | None,
) -> dict | None:
    global _missing_key_logged

    if not settings.openai_tutor_enabled:
        return None

    if not settings.openai_api_key:
        if not _missing_key_logged:
            logger.warning("openai_tutor_disabled reason=missing_OPENAI_API_KEY")
            _missing_key_logged = True
        return None

    client = _build_client()
    if client is None:
        return None

    payload = _build_request_payload(intent, context, learner_message, tutor_state)
    request_kwargs = {
        "model": settings.openai_model,
        "instructions": OPENAI_TUTOR_INSTRUCTIONS,
        "input": [
            {
                "role": "user",
                "content": json.dumps(payload, ensure_ascii=True),
            }
        ],
        "max_output_tokens": settings.openai_max_output_tokens,
        "store": False,
    }

    if settings.openai_reasoning_effort and _model_supports_reasoning(settings.openai_model):
        request_kwargs["reasoning"] = {"effort": settings.openai_reasoning_effort}

    if settings.openai_text_verbosity and _model_supports_verbosity(settings.openai_model):
        request_kwargs["text"] = {"verbosity": settings.openai_text_verbosity}

    try:
        response = client.responses.create(**request_kwargs)
    except Exception as exc:
        logger.warning(
            "openai_tutor_request_failed model=%s intent=%s error_type=%s error=%s",
            settings.openai_model,
            intent,
            exc.__class__.__name__,
            exc,
        )
        return None

    parsed = _extract_json(_extract_response_text(response))
    normalized = _normalize_openai_fields(parsed)
    if normalized is None:
        logger.warning(
            "openai_tutor_malformed_response model=%s intent=%s",
            settings.openai_model,
            intent,
        )
        return None

    return normalized
