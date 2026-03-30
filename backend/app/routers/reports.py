from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.ai_service import generate_summary

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/{session_id}", response_model=schemas.ReportResponse)
def generate_report(
    session_id: int,
    db: Session = Depends(get_db),
):
    session = (
        db.query(models.Session)
        .filter(models.Session.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    findings = (
        db.query(models.Finding)
        .filter(models.Finding.session_id == session_id)
        .all()
    )

    commands = (
        db.query(models.Command)
        .filter(models.Command.session_id == session_id)
        .order_by(models.Command.timestamp.asc())
        .all()
    )

    ai_observations = (
        db.query(models.AIObservation)
        .filter(models.AIObservation.session_id == session_id)
        .order_by(models.AIObservation.created_at.asc())
        .all()
    )

    # AI summary based on findings (can expand later to include commands)
    summary = generate_summary(findings)

    return schemas.ReportResponse(
        session=session,
        findings=findings,
        commands=commands,
        ai_observations=ai_observations,
        summary=summary,
    )