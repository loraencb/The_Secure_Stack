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


def create_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def save_command(db: Session, session_id: int, command: str, output: str):
    cmd = models.Command(
        session_id=session_id,
        command_text=command,
        output=output,
    )
    db.add(cmd)
    db.commit()
    db.refresh(cmd)
    return cmd


def save_ai_observation(db: Session, session_id: int, feedback: dict):
    obs = models.AIObservation(
        session_id=session_id,
        observation_type=feedback.get("assessment", "general"),
        message=json.dumps(feedback),
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)
    return obs


def save_auto_finding(db: Session, session_id: int, finding: dict):
    new_finding = models.Finding(
        session_id=session_id,
        title=finding.get("title", "AI Suggested Finding"),
        severity=finding.get("severity", "Medium"),
        description=finding.get("description", ""),
    )
    db.add(new_finding)
    db.commit()
    db.refresh(new_finding)
    return new_finding


@router.websocket("/ws/terminal/{session_id}")
async def terminal_ws(websocket: WebSocket, session_id: int):
    terminal = None
    sender_task = None
    latest_output_buffer = []
    db = SessionLocal()

    try:
        await websocket.accept()
        logger.info("WebSocket accepted for session %s", session_id)

        terminal = create_terminal_session(session_id)

        await websocket.send_text(json.dumps({
            "type": "terminal_output",
            "data": f"[Terminal connected for session {session_id}]\r\n"
        }))

        async def pump_output():
            while True:
                if terminal.process.poll() is not None:
                    break

                output = read_from_terminal(terminal)
                if output:
                    latest_output_buffer.append(output)
                    if len(latest_output_buffer) > 50:
                        latest_output_buffer.pop(0)

                    await websocket.send_text(json.dumps({
                        "type": "terminal_output",
                        "data": output,
                    }))

                await asyncio.sleep(0.05)

        sender_task = asyncio.create_task(pump_output())

        while True:
            try:
                data = await websocket.receive_text()
            except WebSocketDisconnect:
                break

            command = data.strip()
            if not command:
                continue

            latest_output_buffer.clear()

            write_to_terminal(terminal, command)

            await asyncio.sleep(1.2)
            command_output = "".join(latest_output_buffer).strip()

            # ✅ Save command
            save_command(db, session_id, command, command_output)

            # ✅ AI analysis
            feedback = analyze_terminal_interaction(command, command_output)

            # ✅ Save AI observation
            save_ai_observation(db, session_id, feedback)

            # ✅ Send AI feedback
            await websocket.send_text(json.dumps({
                "type": "ai_feedback",
                "data": feedback,
            }))

            # ✅ Auto findings
            if feedback.get("finding_detected") and feedback.get("finding"):
                if feedback.get("finding_confidence") == "high":
                    finding = save_auto_finding(db, session_id, feedback["finding"])

                    await websocket.send_text(json.dumps({
                        "type": "finding_auto_saved",
                        "data": {
                            "id": finding.id,
                            "title": finding.title,
                            "severity": finding.severity,
                            "description": finding.description,
                        },
                    }))
                else:
                    await websocket.send_text(json.dumps({
                        "type": "finding_suggestion",
                        "data": feedback["finding"],
                    }))

    finally:
        if sender_task:
            sender_task.cancel()

        if terminal:
            cleanup_terminal_session(terminal)

        db.close()

        with contextlib.suppress(Exception):
            await websocket.close()