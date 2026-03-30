from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.services.lab_launcher import launch_lab, stop_lab

router = APIRouter(prefix="/labs", tags=["Labs"])


@router.post("/launch/{session_id}/{lab_id}")
def launch_lab_route(
    session_id: int,
    lab_id: str,
    db: Session = Depends(get_db),
):
    session = (
        db.query(models.Session)
        .filter(models.Session.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        result = launch_lab(session_id, lab_id)
        return {"status": "lab launched", "details": result}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/stop/{session_id}")
def stop_lab_route(
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

    try:
        result = stop_lab(session_id)
        return {"status": "lab stopped", "details": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/status/{session_id}")
def lab_status(
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

    # Placeholder — later this should query Docker/container state
    return {
        "session_id": session_id,
        "status": "unknown (implement container check)",
    }