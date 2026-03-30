from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models, schemas

router = APIRouter(prefix="/findings", tags=["Findings"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=schemas.FindingResponse)
def create_finding(finding: schemas.FindingCreate, db: Session = Depends(get_db)):
    new_finding = models.Finding(**finding.dict())
    db.add(new_finding)
    db.commit()
    db.refresh(new_finding)
    return new_finding

@router.get("/session/{session_id}")
def get_findings(session_id: int, db: Session = Depends(get_db)):
    findings = db.query(models.Finding).filter(
        models.Finding.session_id == session_id
    ).all()

    return findings