import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.terminal_manager import (
    create_terminal_session,
    write_to_terminal,
    read_from_terminal,
    cleanup_terminal_session,
)
from app.services.ai_terminal_feedback import analyze_terminal_interaction

router = APIRouter(tags=["Terminal"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/terminal/{session_id}")
async def terminal_ws(websocket: WebSocket, session_id: int):
    await websocket.accept()
    logger.info("WebSocket accepted for session %s", session_id)

    terminal = None
    sender_task = None
    latest_output_buffer = []

    try:
        terminal = create_terminal_session(session_id)
        logger.info("Terminal process started for session %s", session_id)

        await websocket.send_text(
            json.dumps({
                "type": "terminal_output",
                "data": (
                    f"[Secure Stack terminal connected for session {session_id}]\r\n"
                    "[Linux container shell ready]\r\n"
                ),
            })
        )

        async def pump_output():
            while True:
                if terminal.process.poll() is not None:
                    code = terminal.process.returncode
                    with contextlib.suppress(Exception):
                        await websocket.send_text(
                            json.dumps({
                                "type": "terminal_output",
                                "data": f"\r\n[terminal exited with code {code}]\r\n",
                            })
                        )
                    break

                output = read_from_terminal(terminal)
                if output:
                    latest_output_buffer.append(output)
                    if len(latest_output_buffer) > 20:
                        latest_output_buffer.pop(0)

                    with contextlib.suppress(Exception):
                        await websocket.send_text(
                            json.dumps({
                                "type": "terminal_output",
                                "data": output,
                            })
                        )

                await asyncio.sleep(0.05)

        sender_task = asyncio.create_task(pump_output())

        while True:
            data = await websocket.receive_text()

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
                        json.dumps({
                            "type": "terminal_output",
                            "data": f"\r\n[terminal write error] {exc}\r\n",
                        })
                    )
                break

            await asyncio.sleep(1.2)
            command_output = "".join(latest_output_buffer).strip()

            try:
                feedback = analyze_terminal_interaction(command, command_output)
                with contextlib.suppress(Exception):
                    await websocket.send_text(
                        json.dumps({
                            "type": "ai_feedback",
                            "data": feedback,
                        })
                    )
            except Exception as exc:
                logger.exception("AI feedback failed for session %s: %s", session_id, exc)
                with contextlib.suppress(Exception):
                    await websocket.send_text(
                        json.dumps({
                            "type": "ai_feedback",
                            "data": {
                                "assessment": "neutral",
                                "explanation": "AI feedback failed.",
                                "security_relevance": "No analysis available.",
                                "next_step": "",
                                "warning": str(exc),
                            },
                        })
                    )

    except WebSocketDisconnect:
        logger.info("Terminal websocket disconnected for session %s", session_id)

    except Exception as exc:
        logger.exception(
            "Terminal websocket error for session %s: %s",
            session_id,
            exc,
        )
        with contextlib.suppress(Exception):
            await websocket.send_text(
                json.dumps({
                    "type": "terminal_output",
                    "data": f"\r\n[terminal error] {exc}\r\n",
                })
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