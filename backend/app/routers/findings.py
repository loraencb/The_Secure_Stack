import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_user, get_db, get_owned_session_or_404

router = APIRouter(prefix="/findings", tags=["Findings"])
logger = logging.getLogger("securestack.findings")


@router.post("/", response_model=schemas.FindingResponse)
def create_finding(
    finding: schemas.FindingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_owned_session_or_404(db, finding.session_id, current_user.id)

    new_finding = models.Finding(
        **finding.model_dump(),
        user_id=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_finding)
    db.commit()
    db.refresh(new_finding)
    logger.info(
        "finding_saved user_id=%s session_id=%s finding_id=%s source=%s",
        current_user.id,
        finding.session_id,
        new_finding.id,
        finding.source or "manual",
    )
    return new_finding


@router.get("/session/{session_id}", response_model=list[schemas.FindingResponse])
def get_findings(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_owned_session_or_404(db, session_id, current_user.id)
    findings = (
        db.query(models.Finding)
        .filter(
            models.Finding.session_id == session_id,
            models.Finding.user_id == current_user.id,
        )
        .order_by(models.Finding.created_at.desc(), models.Finding.id.desc())
        .all()
    )

    return findings
