import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_current_user, get_db, get_owned_session_or_404
from app.labs.labs_config import LABS
from app.services.lab_cleanup import teardown_session_environment
from app.services.lab_service import start_lab, stop_lab
from app.services.lab_launcher import check_docker_runtime, launch_lab

router = APIRouter(prefix="/labs", tags=["Labs"])
logger = logging.getLogger("securestack.labs")


@router.post("/start")
def start(current_user: models.User = Depends(get_current_user)):
    logger.info("lab_service_start_requested user_id=%s", current_user.id)
    return start_lab()


@router.post("/stop")
def stop(current_user: models.User = Depends(get_current_user)):
    logger.info("lab_service_stop_requested user_id=%s", current_user.id)
    return stop_lab()

@router.get("/status")
def status():
    docker_ready, docker_detail = check_docker_runtime()
    return {
        "status": "ready" if docker_ready else "degraded",
        "docker_runtime": {
            "status": "ok" if docker_ready else "error",
            "detail": docker_detail,
        },
    }


@router.get("/definition/{lab_id}")
def get_lab_definition(lab_id: str):
    lab = LABS.get(lab_id)
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")

    return {
        "lab_id": lab["lab_id"],
        "name": lab["name"],
        "description": lab.get("description"),
        "difficulty": lab.get("difficulty"),
        "category": lab.get("category"),
        "estimated_duration_minutes": lab.get("estimated_duration_minutes"),
        "learning_objectives": lab.get("learning_objectives", []),
        "prerequisites": lab.get("prerequisites", []),
        "required_tools": lab.get("required_tools", []),
        "success_criteria": lab.get("success_criteria", []),
        "topology": lab.get("topology"),
        "student_manual_path": lab.get("student_manual_path"),
        "instructor_guide_path": lab.get("instructor_guide_path"),
        "tasks": lab.get("tasks", []),
    }

@router.post("/launch/{session_id}/{lab_id}")
def launch_lab_route(
    session_id: int,
    lab_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        session = get_owned_session_or_404(db, session_id, current_user.id)
        if session.status == "completed" or session.end_time:
            raise HTTPException(
                status_code=400,
                detail="Completed sessions cannot launch a new environment. Start a new session instead.",
            )
        result = launch_lab(session_id, lab_id)
        if session:
            session.environment_launched_at = datetime.now(timezone.utc)
            session.lab_id = lab_id
            session.attacker_container = result.get("attacker_container")
            session.target_container = result.get("target_container")
            session.network_name = result.get("network_name")
            session.browser_url = result.get("browser_url")
            db.commit()
            logger.info(
                "environment_launched user_id=%s session_id=%s lab_id=%s attacker=%s target=%s",
                current_user.id,
                session_id,
                lab_id,
                session.attacker_container or "unknown",
                session.target_container or "unknown",
            )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "environment_launch_failed user_id=%s session_id=%s lab_id=%s",
            current_user.id,
            session_id,
            lab_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to launch lab environment",
        )


@router.post("/teardown/{session_id}")
def teardown_lab_route(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = get_owned_session_or_404(db, session_id, current_user.id)
    cleanup = teardown_session_environment(
        session,
        reason="manual_teardown",
        include_derived=True,
        clear_runtime=True,
    )
    db.commit()
    logger.info(
        "environment_torn_down user_id=%s session_id=%s status=%s removed=%s missing=%s errors=%s",
        current_user.id,
        session_id,
        cleanup["status"],
        cleanup["removed_count"],
        cleanup["missing_count"],
        cleanup["error_count"],
    )
    return cleanup
