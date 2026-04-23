import asyncio
import contextlib
import json
import logging
import re
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.dependencies import authenticate_websocket_user
from app.database import SessionLocal
from app import models
from app.labs.labs_config import LABS
from app.services.terminal_manager import (
    cleanup_terminal_session,
    create_terminal_session,
    get_attacker_container_name,
    read_from_terminal,
    write_to_terminal,
)
from app.services.ai_terminal_feedback import (
    analyze_terminal_interaction,
    analyze_tutor_request,
)

router = APIRouter(tags=["Terminal"])
logger = logging.getLogger("securestack.ws_terminal")
PROMPT_PATTERN = re.compile(r"\[stderr\]\s.*#\s*$", re.MULTILINE)
INTERVENTION_COOLDOWNS = {
    "success_reinforcement": 120.0,
    "progress_briefing": 90.0,
    "browser_handoff_guidance": 120.0,
    "off_track_redirect": 75.0,
    "stuck_intervention": 60.0,
    "idle_nudge": 180.0,
}


async def safe_send_json(websocket: WebSocket, payload: dict) -> bool:
    try:
        await websocket.send_text(json.dumps(payload))
        return True
    except (WebSocketDisconnect, RuntimeError):
        return False


def _parse_client_message(raw_data: str) -> dict:
    payload = None
    try:
        payload = json.loads(raw_data)
    except json.JSONDecodeError:
        payload = None

    if isinstance(payload, dict):
        message_type = (payload.get("type") or "").strip()
        if message_type == "ask_tutor":
            history = payload.get("history")
            normalized_history = []
            if isinstance(history, list):
                for item in history[-8:]:
                    if not isinstance(item, dict):
                        continue

                    role = str(item.get("role") or "").strip().lower()
                    content = str(item.get("content") or "").strip()
                    if not content:
                        continue

                    normalized_history.append(
                        {
                            "role": "student"
                            if role in {"student", "user", "learner"}
                            else "tutor",
                            "content": content[:600],
                        }
                    )

            return {
                "type": "ask_tutor",
                "intent": str(payload.get("intent") or "").strip(),
                "message": str(payload.get("message") or "").strip(),
                "history": normalized_history,
            }

        if message_type == "terminal_input":
            return {
                "type": "terminal_input",
                "command": str(
                    payload.get("command") or payload.get("data") or ""
                ).strip(),
            }

    return {
        "type": "terminal_input",
        "command": (raw_data or "").strip(),
    }


def _trim_output_snippet(output: str, limit: int = 600) -> str:
    cleaned = (output or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}\n...[truncated]"


def _extract_browser_port(browser_url: str | None) -> str:
    if not browser_url:
        return ""

    try:
        return browser_url.rsplit(":", 1)[1].strip().rstrip("/")
    except IndexError:
        return ""


def _resolve_step_text(value: str | None, session: models.Session) -> str:
    text = (value or "").strip()
    if not text:
        return ""

    target_port = _extract_browser_port(session.browser_url)
    if "{target_port}" in text and target_port:
        return text.replace("{target_port}", target_port)

    return text


def _build_active_step_context(session: models.Session, db: Session):
    if not session.lab_id:
        return None

    lab_definition = LABS.get(session.lab_id)
    if not lab_definition:
        return None

    tasks = lab_definition.get("tasks", [])
    if not tasks:
        return {
            "lab_id": session.lab_id,
            "lab_name": lab_definition.get("name") or session.lab_name,
            "lab_objectives": lab_definition.get("learning_objectives", [])[:3],
            "topology_summary": (
                lab_definition.get("topology", {}) or {}
            ).get("summary"),
        }

    progress_records = (
        db.query(models.TaskCompletion)
        .filter(
            models.TaskCompletion.session_id == session.id,
            models.TaskCompletion.lab_id == session.lab_id,
        )
        .order_by(models.TaskCompletion.id.asc())
        .all()
    )
    progress_by_task = {record.task_id: record for record in progress_records}

    active_index = next(
        (
            index
            for index, task in enumerate(tasks)
            if progress_by_task.get(task.get("task_id")) is None
            or progress_by_task.get(task.get("task_id")).status != "completed"
        ),
        len(tasks),
    )

    active_task = tasks[active_index] if active_index < len(tasks) else None
    active_progress = (
        progress_by_task.get(active_task.get("task_id"))
        if active_task
        else None
    )
    next_task = (
        tasks[active_index + 1]
        if active_task and (active_index + 1) < len(tasks)
        else None
    )

    hints = active_task.get("hints", []) if active_task else []
    first_hint = ""
    if hints:
        first_hint = _resolve_step_text(hints[0], session)
    elif active_task:
        first_hint = _resolve_step_text(
            active_task.get("hint_text") or active_task.get("command_hint") or "",
            session,
        )

    next_task_hint = ""
    next_task_action = ""
    if next_task:
        next_task_hints = next_task.get("hints", [])
        if next_task_hints:
            next_task_hint = _resolve_step_text(next_task_hints[0], session)
        else:
            fallback_next_hint = (
                session.browser_url
                if next_task.get("step_type") == "browser" and session.browser_url
                else (
                    next_task.get("hint_text")
                    or next_task.get("command_hint")
                    or next_task.get("manual_confirmation_label")
                    or ""
                )
            )
            next_task_hint = _resolve_step_text(fallback_next_hint, session)
        next_task_action = (
            session.browser_url
            if next_task.get("step_type") == "browser" and session.browser_url
            else _resolve_step_text(
                next_task.get("command_hint")
                or next_task.get("manual_confirmation_label")
                or next_task.get("instruction")
                or "",
                session,
            )
        )

    return {
        "lab_id": session.lab_id,
        "lab_name": lab_definition.get("name") or session.lab_name,
        "lab_objectives": lab_definition.get("learning_objectives", [])[:3],
        "lab_pre_lab_context": lab_definition.get("pre_lab_context") or "",
        "lab_environment_overview": lab_definition.get("environment_overview") or "",
        "lab_reflection_prompt": lab_definition.get("reflection_prompt") or "",
        "lab_takeaways": lab_definition.get("lab_takeaways", [])[:4],
        "topology_summary": (
            lab_definition.get("topology", {}) or {}
        ).get("summary"),
        "step_number": (active_index + 1) if active_task else None,
        "step_task_id": active_task.get("task_id") if active_task else None,
        "step_title": active_task.get("title") if active_task else "",
        "step_type": active_task.get("step_type") if active_task else "",
        "step_command_hint": (
            _resolve_step_text(active_task.get("command_hint"), session)
            if active_task
            else ""
        ),
        "step_instruction": (
            _resolve_step_text(active_task.get("instruction"), session)
            if active_task
            else ""
        ),
        "step_explanation": active_task.get("explanation") if active_task else "",
        "step_learning_takeaway": (
            active_task.get("learning_takeaway") if active_task else ""
        ),
        "step_what_to_observe": (
            active_task.get("what_to_observe", []) if active_task else []
        ),
        "step_why_observation_matters": (
            active_task.get("why_observation_matters") if active_task else ""
        ),
        "step_objective": active_task.get("objective") if active_task else "",
        "step_expected_outcome": (
            _resolve_step_text(active_task.get("expected_outcome"), session)
            if active_task
            else ""
        ),
        "step_expected_evidence": active_task.get("expected_evidence", []) if active_task else [],
        "step_success_criteria": active_task.get("success_criteria", []) if active_task else [],
        "step_remediation": (
            _resolve_step_text(active_task.get("remediation_text"), session)
            if active_task
            else ""
        ),
        "step_hint": first_hint,
        "step_hints": [
            _resolve_step_text(hint, session)
            for hint in (active_task.get("hints", []) if active_task else [])
            if hint
        ],
        "step_status": (
            active_progress.status
            if active_progress
            else ("pending" if active_task else "completed")
        ),
        "next_step_number": (active_index + 2) if next_task else None,
        "next_step_title": next_task.get("title") if next_task else "",
        "next_step_instruction": (
            _resolve_step_text(next_task.get("instruction"), session)
            if next_task
            else ""
        ),
        "next_step_action": next_task_action,
        "next_step_hint": next_task_hint,
        "browser_url": session.browser_url,
    }


def _build_ai_context(
    session: models.Session,
    db: Session,
    recent_command_history: list[dict],
    tutor_state: dict[str, dict[str, int]],
    recent_tutor_messages: list[dict] | None = None,
):
    step_context = _build_active_step_context(session, db) or {
        "lab_id": session.lab_id,
        "lab_name": session.lab_name,
    }
    step_task_id = step_context.get("step_task_id")
    step_context["recent_commands"] = recent_command_history[-5:]
    step_context["recent_tutor_messages"] = (recent_tutor_messages or [])[-8:]
    step_context["step_help_requests"] = (
        tutor_state["help_requests"].get(step_task_id, 0) if step_task_id else 0
    )
    step_context["step_off_track_count"] = (
        tutor_state["off_track_counts"].get(step_task_id, 0) if step_task_id else 0
    )
    step_context["step_consecutive_struggle_count"] = (
        tutor_state["struggle_counts"].get(step_task_id, 0) if step_task_id else 0
    )
    return step_context


def _tutor_reply_excerpt(feedback: dict) -> str:
    return (
        feedback.get("explanation")
        or feedback.get("next_step")
        or feedback.get("learning_reinforcement")
        or ""
    ).strip()


def _should_append_feedback_to_chat(
    feedback: dict,
    tutor_delivery_state: dict[str, object],
) -> bool:
    response_origin = (feedback.get("response_origin") or "").strip()
    if response_origin in {"ask_tutor", "tutor_chat"}:
        return True

    if not feedback.get("should_append_to_chat") or not feedback.get(
        "proactive_intervention"
    ):
        return False

    now = time.monotonic()
    intervention_reason = feedback.get("intervention_reason") or ""
    intervention_key = feedback.get("intervention_key") or ""
    cooldown = INTERVENTION_COOLDOWNS.get(intervention_reason, 60.0)
    last_by_key = tutor_delivery_state.get("last_by_key") or {}

    if intervention_key:
        last_sent_at = last_by_key.get(intervention_key, 0.0)
        if (now - last_sent_at) < cooldown:
            return False

    reply_excerpt = _tutor_reply_excerpt(feedback)
    if (
        reply_excerpt
        and reply_excerpt == tutor_delivery_state.get("last_content", "")
        and (now - tutor_delivery_state.get("last_sent_at", 0.0)) < cooldown
    ):
        return False

    return True


def _record_tutor_feedback(
    feedback: dict,
    recent_tutor_messages: list[dict],
    tutor_delivery_state: dict[str, object],
):
    reply_excerpt = _tutor_reply_excerpt(feedback)
    if not reply_excerpt:
        return

    recent_tutor_messages.append(
        {
            "role": "tutor",
            "content": reply_excerpt[:600],
        }
    )
    del recent_tutor_messages[:-12]

    sent_at = time.monotonic()
    tutor_delivery_state["last_content"] = reply_excerpt
    tutor_delivery_state["last_sent_at"] = sent_at
    intervention_key = feedback.get("intervention_key") or ""
    if intervention_key:
        tutor_delivery_state.setdefault("last_by_key", {})[intervention_key] = sent_at


def save_auto_finding(
    session_id: int,
    user_id: int,
    finding: dict,
    context: dict | None = None,
    evidence_command: str | None = None,
):
    db: Session = SessionLocal()
    try:
        title = (finding.get("title") or "AI Suggested Finding").strip()
        severity = (finding.get("severity") or "Medium").strip()
        description = (finding.get("description") or "").strip()
        evidence = (finding.get("evidence") or "").strip()

        full_description = description
        if evidence:
            full_description += f"\n\nEvidence:\n{evidence}"

        existing_finding = (
            db.query(models.Finding)
            .filter(
                models.Finding.session_id == session_id,
                models.Finding.user_id == user_id,
                models.Finding.title == title,
            )
            .first()
        )
        if existing_finding:
            return existing_finding, False

        task_label = None
        if context and context.get("step_number") and context.get("step_title"):
            task_label = f"Step {context['step_number']}: {context['step_title']}"

        new_finding = models.Finding(
            session_id=session_id,
            user_id=user_id,
            title=title,
            severity=severity,
            description=full_description,
            source="ai_auto_saved",
            task_id=context.get("step_task_id") if context else None,
            task_label=task_label,
            task_objective=(
                (context.get("step_objective") or context.get("step_instruction"))
                if context
                else None
            ),
            evidence_command=(evidence_command or "").strip() or None,
            evidence_snapshot=evidence or None,
        )
        db.add(new_finding)
        db.commit()
        db.refresh(new_finding)
        return new_finding, True
    finally:
        db.close()


def save_tutor_event(
    session_id: int,
    user_id: int,
    feedback: dict,
    context: dict | None = None,
    learner_message: str | None = None,
):
    tutor_message = _tutor_reply_excerpt(feedback)
    if not tutor_message:
        return

    db: Session = SessionLocal()
    try:
        tutor_event = models.TutorEvent(
            session_id=session_id,
            user_id=user_id,
            lab_id=(context or {}).get("lab_id"),
            task_id=(context or {}).get("step_task_id"),
            step_number=(context or {}).get("step_number"),
            step_title=(context or {}).get("step_title"),
            response_origin=(feedback.get("response_origin") or "").strip() or None,
            tutor_mode=(feedback.get("tutor_mode") or "").strip() or None,
            intervention_reason=(feedback.get("intervention_reason") or "").strip()
            or None,
            ask_intent=(feedback.get("ask_intent") or "").strip() or None,
            learner_message=(learner_message or "").strip() or None,
            tutor_message=tutor_message,
        )
        db.add(tutor_event)
        db.commit()
    finally:
        db.close()


def _update_tutor_state(
    tutor_state: dict[str, dict[str, int]],
    feedback: dict,
    step_task_id: str | None,
):
    if not step_task_id:
        return

    if feedback.get("step_completed_detected"):
        tutor_state["struggle_counts"][step_task_id] = 0
        return

    if feedback.get("help_request_detected"):
        tutor_state["help_requests"][step_task_id] = (
            tutor_state["help_requests"].get(step_task_id, 0) + 1
        )

    if feedback.get("off_track_detected"):
        tutor_state["off_track_counts"][step_task_id] = (
            tutor_state["off_track_counts"].get(step_task_id, 0) + 1
        )

    if (
        feedback.get("help_request_detected")
        or feedback.get("off_track_detected")
        or feedback.get("hint_level", 0) > 0
    ):
        tutor_state["struggle_counts"][step_task_id] = (
            tutor_state["struggle_counts"].get(step_task_id, 0) + 1
        )
    else:
        tutor_state["struggle_counts"][step_task_id] = 0


async def collect_command_output(latest_output_buffer, max_wait=30.0, idle_wait=0.6):
    start = time.monotonic()
    last_change = start
    previous_size = 0
    has_output = False

    while True:
        combined_output = "".join(latest_output_buffer)
        current_size = len(latest_output_buffer)
        if current_size != previous_size:
            previous_size = current_size
            last_change = time.monotonic()
            has_output = current_size > 0

        now = time.monotonic()
        if (
            has_output
            and PROMPT_PATTERN.search(combined_output)
            and (now - last_change) >= idle_wait
        ):
            return combined_output.strip()

        if (now - start) >= max_wait:
            return combined_output.strip()

        await asyncio.sleep(0.1)


@router.websocket("/ws/terminal/{session_id}")
async def terminal_ws(websocket: WebSocket, session_id: int):
    terminal = None
    sender_task = None
    latest_output_buffer = []
    recent_command_history = []
    recent_tutor_messages = []
    tutor_state = {
        "help_requests": {},
        "off_track_counts": {},
        "struggle_counts": {},
    }
    tutor_delivery_state = {
        "last_by_key": {},
        "last_content": "",
        "last_sent_at": 0.0,
    }
    db: Session = SessionLocal()

    try:
        current_user = authenticate_websocket_user(websocket, db)
        if not current_user:
            logger.warning(
                "terminal_websocket_unauthorized session_id=%s client=%s",
                session_id,
                websocket.client,
            )
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        session = (
            db.query(models.Session)
            .filter(
                models.Session.id == session_id,
                models.Session.user_id == current_user.id,
            )
            .first()
        )
        if not session:
            logger.warning(
                "terminal_websocket_session_not_found session_id=%s user_id=%s",
                session_id,
                current_user.id,
            )
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        expected_container = get_attacker_container_name(session_id)

        await websocket.accept()
        logger.info("WebSocket accepted for session %s", session_id)

        terminal = create_terminal_session(session_id)
        logger.info("Terminal process started for session %s", session_id)

        if not await safe_send_json(
            websocket,
            {
                "type": "terminal_output",
                "data": (
                    f"[Secure Stack terminal connected for session {session_id}]\r\n"
                    f"[Attacker container: {expected_container}]\r\n"
                    "[Linux container shell ready]\r\n"
                ),
            },
        ):
            return

        async def pump_output():
            while True:
                if terminal.process.poll() is not None:
                    code = terminal.process.returncode
                    if not await safe_send_json(
                        websocket,
                        {
                            "type": "terminal_output",
                            "data": f"\r\n[terminal exited with code {code}]\r\n",
                        },
                    ):
                        return
                    break

                output = read_from_terminal(terminal)
                if output:
                    latest_output_buffer.append(output)
                    if len(latest_output_buffer) > 200:
                        latest_output_buffer.pop(0)

                    if not await safe_send_json(
                        websocket,
                        {
                            "type": "terminal_output",
                            "data": output,
                        },
                    ):
                        return

                await asyncio.sleep(0.05)

        sender_task = asyncio.create_task(pump_output())

        while True:
            try:
                data = await websocket.receive_text()
            except WebSocketDisconnect:
                logger.info("Terminal websocket disconnected for session %s", session_id)
                break
            except RuntimeError as exc:
                logger.info(
                    "Terminal websocket runtime disconnect for session %s: %s",
                    session_id,
                    exc,
                )
                break

            if data is None:
                continue

            client_message = _parse_client_message(data)
            message_type = client_message["type"]

            if message_type == "ask_tutor":
                ask_intent = client_message["intent"] or "hint"
                learner_message = client_message.get("message") or ""
                incoming_history = client_message.get("history") or []
                logger.info(
                    "Received tutor request for session %s: %s",
                    session_id,
                    ask_intent if not learner_message else f"{ask_intent} ({learner_message[:120]})",
                )

                try:
                    ai_context = _build_ai_context(
                        session,
                        db,
                        recent_command_history,
                        tutor_state,
                        recent_tutor_messages,
                    )
                    conversation_history = (
                        incoming_history[-8:]
                        if incoming_history
                        else recent_tutor_messages[-8:]
                    )
                    ai_context["recent_tutor_messages"] = conversation_history

                    if learner_message:
                        recent_tutor_messages.append(
                            {
                                "role": "student",
                                "content": learner_message[:600],
                            }
                        )
                        recent_tutor_messages = recent_tutor_messages[-12:]

                    feedback = analyze_tutor_request(
                        ask_intent,
                        ai_context,
                        learner_message=learner_message,
                        conversation_history=conversation_history,
                    )
                    current_step_task_id = ai_context.get("step_task_id")
                    _update_tutor_state(tutor_state, feedback, current_step_task_id)
                    feedback["should_append_to_chat"] = _should_append_feedback_to_chat(
                        feedback,
                        tutor_delivery_state,
                    )
                    if feedback["should_append_to_chat"]:
                        _record_tutor_feedback(
                            feedback,
                            recent_tutor_messages,
                            tutor_delivery_state,
                        )
                        save_tutor_event(
                            session_id,
                            current_user.id,
                            feedback,
                            ai_context,
                            learner_message=(
                                learner_message
                                or feedback.get("ask_label")
                                or ask_intent.replace("_", " ")
                            ),
                        )

                    if not await safe_send_json(
                        websocket,
                        {
                            "type": "ai_feedback",
                            "data": feedback,
                        },
                    ):
                        break
                except Exception as exc:
                    logger.exception(
                        "Tutor request failed for session %s: %s",
                        session_id,
                        exc,
                    )
                    if not await safe_send_json(
                        websocket,
                        {
                            "type": "ai_feedback",
                            "data": {
                                "assessment": "neutral",
                                "phase": "general-navigation",
                                "explanation": "The tutor could not prepare guidance right now.",
                                "security_relevance": "No guidance was returned for the active lab step.",
                                "next_step": "Review the current guide step and try again.",
                                "warning": str(exc),
                                "finding_detected": False,
                                "finding_confidence": "low",
                                "finding": None,
                                "response_origin": (
                                    "tutor_chat" if learner_message else "ask_tutor"
                                ),
                                "ask_intent": ask_intent,
                                "ask_label": ask_intent.replace("_", " ").title(),
                            },
                        },
                    ):
                        break

                continue

            command = client_message["command"]
            if not command:
                continue

            logger.info(
                "Received terminal input for session %s: %s",
                session_id,
                command[:200],
            )

            latest_output_buffer.clear()

            try:
                write_to_terminal(terminal, command)
            except Exception as exc:
                logger.exception(
                    "Terminal write failed for session %s: %s",
                    session_id,
                    exc,
                )
                await safe_send_json(
                    websocket,
                    {
                        "type": "terminal_output",
                        "data": f"\r\n[terminal write error] {exc}\r\n",
                    },
                )
                break

            command_output = await collect_command_output(latest_output_buffer)
            recent_command_history.append(
                {
                    "command": command,
                    "output": _trim_output_snippet(command_output),
                }
            )
            recent_command_history = recent_command_history[-6:]

            try:
                ai_context = _build_ai_context(
                    session,
                    db,
                    recent_command_history,
                    tutor_state,
                    recent_tutor_messages,
                )
                feedback = analyze_terminal_interaction(
                    command,
                    command_output,
                    ai_context,
                )
                current_step_task_id = ai_context.get("step_task_id")
                if recent_command_history:
                    recent_command_history[-1].update(
                        {
                            "assessment": feedback.get("assessment"),
                            "help_request_detected": feedback.get(
                                "help_request_detected", False
                            ),
                            "off_track_detected": feedback.get(
                                "off_track_detected", False
                            ),
                            "hint_level": feedback.get("hint_level", 0),
                        }
                    )

                _update_tutor_state(tutor_state, feedback, current_step_task_id)
                feedback["should_append_to_chat"] = _should_append_feedback_to_chat(
                    feedback,
                    tutor_delivery_state,
                )
                if feedback["should_append_to_chat"]:
                    _record_tutor_feedback(
                        feedback,
                        recent_tutor_messages,
                        tutor_delivery_state,
                    )
                    save_tutor_event(
                        session_id,
                        current_user.id,
                        feedback,
                        ai_context,
                    )

                if not await safe_send_json(
                    websocket,
                    {
                        "type": "ai_feedback",
                        "data": feedback,
                    },
                ):
                    break

                finding_detected = feedback.get("finding_detected")
                finding_confidence = feedback.get("finding_confidence")
                finding = feedback.get("finding")

                if finding_detected and finding and finding_confidence == "high":
                    saved_finding, was_created = save_auto_finding(
                        session_id,
                        current_user.id,
                        finding,
                        ai_context,
                        command,
                    )

                    if was_created:
                        if not await safe_send_json(
                            websocket,
                            {
                                "type": "finding_auto_saved",
                                "data": {
                                    "id": saved_finding.id,
                                    "session_id": saved_finding.session_id,
                                    "title": saved_finding.title,
                                    "severity": saved_finding.severity,
                                    "description": saved_finding.description,
                                    "source": saved_finding.source,
                                    "task_id": saved_finding.task_id,
                                    "task_label": saved_finding.task_label,
                                    "task_objective": saved_finding.task_objective,
                                    "evidence_command": saved_finding.evidence_command,
                                    "evidence_snapshot": saved_finding.evidence_snapshot,
                                    "created_at": saved_finding.created_at.isoformat()
                                    if saved_finding.created_at
                                    else None,
                                },
                            },
                        ):
                            break

            except Exception as exc:
                logger.exception(
                    "AI feedback failed for session %s: %s",
                    session_id,
                    exc,
                )
                if not await safe_send_json(
                    websocket,
                    {
                        "type": "ai_feedback",
                        "data": {
                            "assessment": "neutral",
                            "phase": "general-navigation",
                            "explanation": "AI feedback failed.",
                            "security_relevance": "No analysis available.",
                            "next_step": "Continue with the guided recon steps and review the command output manually.",
                            "warning": str(exc),
                            "finding_detected": False,
                            "finding_confidence": "low",
                            "finding": None,
                        },
                    },
                ):
                    break

    except (WebSocketDisconnect, RuntimeError):
        logger.info("Terminal websocket closed cleanly for session %s", session_id)
    except Exception as exc:
        logger.exception(
            "Terminal websocket error for session %s: %s",
            session_id,
            exc,
        )
        await safe_send_json(
            websocket,
            {
                "type": "terminal_output",
                "data": f"\r\n[terminal error] {exc}\r\n",
            },
        )

    finally:
        db.close()

        if sender_task:
            sender_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await sender_task

        if terminal:
            cleanup_terminal_session(terminal)

        with contextlib.suppress(Exception):
            await websocket.close()
