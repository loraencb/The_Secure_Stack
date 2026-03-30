from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/findings", tags=["Findings"])


@router.post("/", response_model=schemas.FindingResponse)
def create_finding(
    finding: schemas.FindingCreate,
    db: Session = Depends(get_db),
):
    session = (
        db.query(models.Session)
        .filter(models.Session.id == finding.session_id)
        .first()
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    new_finding = models.Finding(**finding.model_dump())
    db.add(new_finding)
    db.commit()
    db.refresh(new_finding)
    return new_finding


@router.get("/session/{session_id}", response_model=list[schemas.FindingResponse])
def get_findings(
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
        .order_by(models.Finding.created_at.desc())
        .all()
    )

    return findings