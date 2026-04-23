import re
import shlex

from app.labs.labs_config import LABS


def get_lab_task(lab_id: str, task_id: str) -> dict | None:
    lab = LABS.get(lab_id) or {}

    for task in lab.get("tasks", []):
        if task.get("task_id") == task_id:
            return task

    return None


def command_matches_hint(command: str, hint: str) -> bool:
    normalized_command = (command or "").strip().lower()
    normalized_hint = (hint or "").strip().lower()

    if not normalized_command or not normalized_hint:
        return False

    if normalized_hint.startswith("http://") or normalized_hint.startswith("https://"):
        return False

    if normalized_command == normalized_hint:
        return True

    command_tokens = _safe_split(normalized_command)
    hint_tokens = _safe_split(normalized_hint)
    if not command_tokens or not hint_tokens:
        return False

    if command_tokens[0] != hint_tokens[0]:
        return False

    if len(hint_tokens) == 1:
        return True

    required_markers = _extract_required_markers(hint_tokens[1:])
    if not required_markers:
        return True

    command_tail = command_tokens[1:]
    return all(
        any(_token_matches_marker(token, marker) for token in command_tail)
        for marker in required_markers
    )


def _safe_split(value: str) -> list[str]:
    try:
        return [token.strip().lower() for token in shlex.split(value or "") if token.strip()]
    except ValueError:
        return [token.strip().lower() for token in (value or "").split() if token.strip()]


def _extract_required_markers(tokens: list[str]) -> list[str]:
    required = []
    skip_next_numeric = False

    for token in tokens:
        if not token:
            continue

        if skip_next_numeric and token.isdigit():
            skip_next_numeric = False
            continue

        skip_next_numeric = False
        if token in {"-c", "--count"}:
            required.append(token)
            skip_next_numeric = True
            continue

        if token.startswith("-"):
            required.append(token)
            continue

        if token.isdigit():
            continue

        required.append(token)

    return required


def _token_matches_marker(token: str, marker: str) -> bool:
    if token == marker:
        return True

    if marker.startswith(("http://", "https://")):
        return token.startswith(marker)

    return marker in token


def _match_expected_signal(task_id: str, expected_signal: str, output: str) -> bool:
    output_lower = (output or "").lower()
    signal_lower = (expected_signal or "").lower()

    if task_id == "verify-connectivity":
        if signal_lower == "icmp_seq":
            return bool(re.search(r"icmp_seq=\d+", output_lower))
        if signal_lower == "0% packet loss":
            return "0% packet loss" in output_lower

    if task_id == "identify-open-services":
        if signal_lower == "3000/tcp open":
            return bool(re.search(r"(?m)^3000/tcp\s+open\b", output_lower))
        if signal_lower == "service fingerprint":
            return bool(re.search(r"(?m)^\d+/(tcp|udp)\s+open\s+\S+\s+.+$", output, re.IGNORECASE))

    if task_id == "inspect-web-application":
        if signal_lower == "http/1.1 200 ok":
            return (
                "http/1.1 200 ok" in output_lower
                or "<!doctype html>" in output_lower
                or "<html" in output_lower
            )
        if signal_lower == "owasp juice shop":
            return "owasp juice shop" in output_lower

    return signal_lower in output_lower


def _evaluate_evidence(task: dict, output: str) -> tuple[list[str], list[str]]:
    matched = []
    missing = []

    for expected_signal in task.get("expected_evidence", []):
        if _match_expected_signal(task.get("task_id", ""), expected_signal, output or ""):
            matched.append(expected_signal)
        else:
            missing.append(expected_signal)

    return matched, missing


def evaluate_task_attempt(
    lab_id: str,
    task_id: str,
    command: str,
    output: str,
    terminal_assessment: str | None = None,
    terminal_explanation: str | None = None,
    terminal_next_step: str | None = None,
) -> dict:
    task = get_lab_task(lab_id, task_id)

    if not task:
        return {
            "status": "attempted",
            "ai_status": "insufficient",
            "ai_feedback": "The task definition could not be loaded, so the evidence could not be evaluated reliably.",
            "ai_confidence": "low",
            "evidence_quality": "weak",
        }

    if task.get("step_type") != "command":
        return {
            "status": "completed",
            "ai_status": "manual_confirmation",
            "ai_feedback": "This task is completed by manual confirmation rather than terminal evidence.",
            "ai_confidence": "high",
            "evidence_quality": "strong",
        }

    if not command_matches_hint(command, task.get("command_hint", "")):
        return {
            "status": "off_track",
            "ai_status": "off_track",
            "ai_feedback": (
                f"This command does not match the current task. Use `{task.get('command_hint', 'the expected command')}` "
                "to gather the evidence for this step."
            ),
            "ai_confidence": "high",
            "evidence_quality": "weak",
        }

    matched, missing = _evaluate_evidence(task, output)
    expected_count = len(task.get("expected_evidence", []))
    matched_count = len(matched)
    output_present = bool((output or "").strip())

    if expected_count and matched_count == expected_count:
        feedback_parts = [
            "The command produced evidence that satisfies this task.",
            f"Matched evidence: {', '.join(matched)}.",
        ]
        if terminal_explanation:
            feedback_parts.append(terminal_explanation)

        return {
            "status": "completed",
            "ai_status": "successful",
            "ai_feedback": " ".join(feedback_parts),
            "ai_confidence": "high",
            "evidence_quality": "strong",
        }

    if matched_count > 0:
        feedback_parts = [
            "The command is on the right track, but the captured output is not strong enough to satisfy the task yet.",
            f"Matched evidence: {', '.join(matched)}.",
        ]
        if missing:
            feedback_parts.append(f"Missing evidence: {', '.join(missing)}.")
        if terminal_next_step:
            feedback_parts.append(f"Next step: {terminal_next_step}")

        return {
            "status": "attempted",
            "ai_status": "insufficient",
            "ai_feedback": " ".join(feedback_parts),
            "ai_confidence": "medium",
            "evidence_quality": "partial",
        }

    if output_present:
        feedback_parts = [
            "The command ran, but the output did not capture the evidence required for this task.",
        ]
        if missing:
            feedback_parts.append(f"Look for: {', '.join(missing)}.")
        if terminal_assessment == "incorrect":
            feedback_parts.append("The terminal analysis also classified this command as incorrect for the current phase.")
        elif terminal_explanation:
            feedback_parts.append(terminal_explanation)

        return {
            "status": "attempted",
            "ai_status": "insufficient",
            "ai_feedback": " ".join(feedback_parts),
            "ai_confidence": "medium",
            "evidence_quality": "weak",
        }

    return {
        "status": "attempted",
        "ai_status": "insufficient",
        "ai_feedback": "No usable command output was captured, so this task cannot be satisfied yet.",
        "ai_confidence": "high",
        "evidence_quality": "none",
    }
