from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("/start", response_model=schemas.SessionResponse)
def start_session(
    session_data: schemas.SessionCreate,
    db: Session = Depends(get_db),
):
    new_session = models.Session(
        lab_name=session_data.lab_name,
        status="active",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


@router.post("/end/{session_id}")
def end_session(
    session_id: int,
    db: Session = Depends(get_db),
):
    session = db.query(models.Session).filter(models.Session.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = "completed"
    session.end_time = datetime.now(timezone.utc)

    db.commit()

    return {"status": "Session ended", "session_id": session.id}


@router.get("/{session_id}", response_model=schemas.SessionResponse)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
):
    session = db.query(models.Session).filter(models.Session.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return session


@router.get("/", response_model=list[schemas.SessionResponse])
def list_sessions(db: Session = Depends(get_db)):
    return db.query(models.Session).order_by(models.Session.start_time.desc()).all()