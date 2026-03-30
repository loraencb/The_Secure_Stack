from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models, schemas
from app.services.ai_service import generate_summary

router = APIRouter(prefix="/reports", tags=["Reports"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/{session_id}")
def generate_report(session_id: int, db: Session = Depends(get_db)):

    session = db.query(models.Session).filter(
        models.Session.id == session_id
    ).first()

    if not session:
        return {"error": "Session not found"}

    findings = db.query(models.Finding).filter(
        models.Finding.session_id == session_id
    ).all()

    # 🔥 AI summary
    ai_summary = generate_summary(findings)

    return {
        "session": session,
        "findings": findings,
        "analysis": ai_summary,
    }