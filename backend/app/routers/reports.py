from datetime import datetime, timezone

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_user, get_db, get_owned_session_or_404
from app.services.ai_service import generate_summary

router = APIRouter(prefix="/reports", tags=["Reports"])
logger = logging.getLogger("securestack.reports")


@router.get("/{session_id}", response_model=schemas.ReportResponse)
def generate_report(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):

    session = get_owned_session_or_404(db, session_id, current_user.id)

    findings = (
        db.query(models.Finding)
        .filter(
            models.Finding.session_id == session_id,
            models.Finding.user_id == current_user.id,
        )
        .all()
    )

    # 🔥 AI summary
    ai_summary = generate_summary(findings)
    session.report_generated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    logger.info(
        "report_generated user_id=%s session_id=%s findings=%s",
        current_user.id,
        session_id,
        len(findings),
    )

    return {
        "session": session,
        "findings": findings,
        "analysis": ai_summary,
    }
