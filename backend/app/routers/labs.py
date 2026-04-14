from fastapi import APIRouter, HTTPException
from app.labs.labs_config import LABS
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


@router.get("/definition/{lab_id}")
def get_lab_definition(lab_id: str):
    lab = LABS.get(lab_id)
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")

    return {
        "lab_id": lab["lab_id"],
        "name": lab["name"],
        "description": lab.get("description"),
        "difficulty": lab.get("difficulty"),
        "category": lab.get("category"),
        "estimated_duration_minutes": lab.get("estimated_duration_minutes"),
        "learning_objectives": lab.get("learning_objectives", []),
        "prerequisites": lab.get("prerequisites", []),
        "required_tools": lab.get("required_tools", []),
        "success_criteria": lab.get("success_criteria", []),
        "student_manual_path": lab.get("student_manual_path"),
        "instructor_guide_path": lab.get("instructor_guide_path"),
        "tasks": lab.get("tasks", []),
    }

@router.post("/launch/{session_id}/{lab_id}")
def launch_lab_route(session_id: int, lab_id: str):
    try:
        return launch_lab(session_id, lab_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
