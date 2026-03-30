from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models, schemas
from datetime import datetime

router = APIRouter(prefix="/sessions", tags=["Sessions"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/start", response_model=schemas.SessionResponse)
def start_session(session: schemas.SessionCreate, db: Session = Depends(get_db)):
    new_session = models.Session(lab_name=session.lab_name)
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


@router.post("/end/{session_id}")
def end_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(models.Session).filter(models.Session.id == session_id).first()

    if not session:
        return {"error": "Session not found"}

    session.status = "completed"
    session.end_time = datetime.utcnow()

    db.commit()

    return {"status": "Session ended"}