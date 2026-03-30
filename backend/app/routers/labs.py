from fastapi import APIRouter, HTTPException
from app.services.lab_service import start_lab, stop_lab
from app.services.lab_launcher import launch_lab

router = APIRouter(prefix="/labs", tags=["Labs"])


@router.post("/start")
def start():
    return start_lab()


@router.post("/stop")
def stop():
    return stop_lab()

@router.get("/status")
def status():
    return {"status": "running (manual check for now)"}

@router.post("/launch/{session_id}/{lab_id}")
def launch_lab_route(session_id: int, lab_id: str):
    try:
        return launch_lab(session_id, lab_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))