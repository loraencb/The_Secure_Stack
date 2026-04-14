import asyncio
import contextlib
import json
import logging
import re
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app import models
from app.services.terminal_manager import (
    cleanup_terminal_session,
    create_terminal_session,
    get_attacker_container_name,
    read_from_terminal,
    write_to_terminal,
)
from app.services.ai_terminal_feedback import analyze_terminal_interaction

router = APIRouter(tags=["Terminal"])
logger = logging.getLogger(__name__)
PROMPT_PATTERN = re.compile(r"\[stderr\]\s.*#\s*$", re.MULTILINE)


async def safe_send_json(websocket: WebSocket, payload: dict) -> bool:
    try:
        await websocket.send_text(json.dumps(payload))
        return True
    except (WebSocketDisconnect, RuntimeError):
        return False


def save_auto_finding(session_id: int, finding: dict):
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
                models.Finding.title == title,
            )
            .first()
        )
        if existing_finding:
            return existing_finding, False

        new_finding = models.Finding(
            session_id=session_id,
            title=title,
            severity=severity,
            description=full_description,
        )
        db.add(new_finding)
        db.commit()
        db.refresh(new_finding)
        return new_finding, True
    finally:
        db.close()


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
    db: Session = SessionLocal()

    try:
        session = (
            db.query(models.Session).filter(models.Session.id == session_id).first()
        )
        if not session:
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

            command = data.strip()
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

            try:
                feedback = analyze_terminal_interaction(command, command_output)

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
                    saved_finding, was_created = save_auto_finding(session_id, finding)

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
