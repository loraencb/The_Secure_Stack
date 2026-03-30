import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app import models
from app.services.terminal_manager import (
    create_terminal_session,
    write_to_terminal,
    read_from_terminal,
    cleanup_terminal_session,
)
from app.services.ai_terminal_feedback import analyze_terminal_interaction

router = APIRouter(tags=["Terminal"])
logger = logging.getLogger(__name__)


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

        new_finding = models.Finding(
            session_id=session_id,
            title=title,
            severity=severity,
            description=full_description,
        )
        db.add(new_finding)
        db.commit()
        db.refresh(new_finding)
        return new_finding
    finally:
        db.close()


@router.websocket("/ws/terminal/{session_id}")
async def terminal_ws(websocket: WebSocket, session_id: int):
    terminal = None
    sender_task = None
    latest_output_buffer = []

    try:
        await websocket.accept()
        logger.info("WebSocket accepted for session %s", session_id)

        terminal = create_terminal_session(session_id)
        logger.info("Terminal process started for session %s", session_id)

        await websocket.send_text(
            json.dumps(
                {
                    "type": "terminal_output",
                    "data": (
                        f"[Secure Stack terminal connected for session {session_id}]\r\n"
                        "[Linux container shell ready]\r\n"
                    ),
                }
            )
        )

        async def pump_output():
            while True:
                if terminal.process.poll() is not None:
                    code = terminal.process.returncode
                    with contextlib.suppress(Exception):
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "terminal_output",
                                    "data": f"\r\n[terminal exited with code {code}]\r\n",
                                }
                            )
                        )
                    break

                output = read_from_terminal(terminal)
                if output:
                    latest_output_buffer.append(output)
                    if len(latest_output_buffer) > 50:
                        latest_output_buffer.pop(0)

                    with contextlib.suppress(Exception):
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "terminal_output",
                                    "data": output,
                                }
                            )
                        )

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
                with contextlib.suppress(Exception):
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "terminal_output",
                                "data": f"\r\n[terminal write error] {exc}\r\n",
                            }
                        )
                    )
                break

            await asyncio.sleep(1.2)
            command_output = "".join(latest_output_buffer).strip()

            try:
                feedback = analyze_terminal_interaction(command, command_output)

                with contextlib.suppress(Exception):
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "ai_feedback",
                                "data": feedback,
                            }
                        )
                    )

                finding_detected = feedback.get("finding_detected")
                finding_confidence = feedback.get("finding_confidence")
                finding = feedback.get("finding")

                if finding_detected and finding:
                    if finding_confidence == "high":
                        saved_finding = save_auto_finding(session_id, finding)

                        with contextlib.suppress(Exception):
                            await websocket.send_text(
                                json.dumps(
                                    {
                                        "type": "finding_auto_saved",
                                        "data": {
                                            "id": saved_finding.id,
                                            "session_id": saved_finding.session_id,
                                            "title": saved_finding.title,
                                            "severity": saved_finding.severity,
                                            "description": saved_finding.description,
                                        },
                                    }
                                )
                            )
                    else:
                        with contextlib.suppress(Exception):
                            await websocket.send_text(
                                json.dumps(
                                    {
                                        "type": "finding_suggestion",
                                        "data": finding,
                                    }
                                )
                            )

            except Exception as exc:
                logger.exception(
                    "AI feedback failed for session %s: %s",
                    session_id,
                    exc,
                )
                with contextlib.suppress(Exception):
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "ai_feedback",
                                "data": {
                                    "assessment": "neutral",
                                    "phase": "general-navigation",
                                    "explanation": "AI feedback failed.",
                                    "security_relevance": "No analysis available.",
                                    "next_step": "",
                                    "warning": str(exc),
                                    "finding_detected": False,
                                    "finding_confidence": "low",
                                    "finding": None,
                                },
                            }
                        )
                    )

    except Exception as exc:
        logger.exception(
            "Terminal websocket error for session %s: %s",
            session_id,
            exc,
        )
        with contextlib.suppress(Exception):
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "terminal_output",
                        "data": f"\r\n[terminal error] {exc}\r\n",
                    }
                )
            )

    finally:
        if sender_task:
            sender_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await sender_task

        if terminal:
            cleanup_terminal_session(terminal)

        with contextlib.suppress(Exception):
            await websocket.close()