import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_user, get_db, get_owned_session_or_404

router = APIRouter(prefix="/sessions", tags=["Sessions"])
logger = logging.getLogger("securestack.sessions")


def get_history_status(session, findings_count: int) -> str:
    if session.report_generated_at:
        return "Report generated"

    if findings_count > 0:
        return "Evidence captured"

    if session.environment_launched_at:
        return "Environment launched"

    if session.status == "completed" or session.end_time:
        return "Completed"

    return "In progress"


@router.post("/start", response_model=schemas.SessionResponse)
def start_session(
    session: schemas.SessionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    new_session = models.Session(
        user_id=current_user.id,
        lab_name=session.lab_name,
        lab_id=session.lab_id,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    logger.info(
        "session_started user_id=%s session_id=%s lab_id=%s",
        current_user.id,
        new_session.id,
        session.lab_id or "unknown",
    )
    return new_session


@router.get("/history", response_model=list[schemas.SessionHistoryResponse])
def get_session_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    findings_count_subquery = (
        db.query(
            models.Finding.session_id.label("session_id"),
            func.count(models.Finding.id).label("findings_count"),
        )
        .filter(models.Finding.user_id == current_user.id)
        .group_by(models.Finding.session_id)
        .subquery()
    )

    rows = (
        db.query(
            models.Session,
            func.coalesce(findings_count_subquery.c.findings_count, 0).label(
                "findings_count"
            ),
        )
        .outerjoin(
            findings_count_subquery,
            findings_count_subquery.c.session_id == models.Session.id,
        )
        .filter(models.Session.user_id == current_user.id)
        .order_by(models.Session.start_time.desc(), models.Session.id.desc())
        .all()
    )

    return [
        schemas.SessionHistoryResponse(
            id=session.id,
            lab_id=session.lab_id,
            lab_name=session.lab_name,
            status=session.status,
            start_time=session.start_time,
            environment_launched_at=session.environment_launched_at,
            report_generated_at=session.report_generated_at,
            attacker_container=session.attacker_container,
            target_container=session.target_container,
            findings_count=findings_count or 0,
            history_status=get_history_status(session, findings_count or 0),
        )
        for session, findings_count in rows
    ]


@router.get("/{session_id}", response_model=schemas.SessionResponse)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return get_owned_session_or_404(db, session_id, current_user.id)


@router.post("/end/{session_id}")
def end_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = get_owned_session_or_404(db, session_id, current_user.id)
    session.status = "completed"
    session.end_time = datetime.now(timezone.utc)

    db.commit()
    logger.info(
        "session_completed user_id=%s session_id=%s",
        current_user.id,
        session.id,
    )

    return {"status": "Session ended"}
