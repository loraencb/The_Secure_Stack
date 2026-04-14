from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import SessionLocal
from app.services.task_evaluator import evaluate_task_attempt

router = APIRouter(prefix="/task-progress", tags=["Task Progress"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_session_or_404(db: Session, session_id: int):
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/session/{session_id}", response_model=list[schemas.TaskProgressResponse])
def get_task_progress(session_id: int, db: Session = Depends(get_db)):
    get_session_or_404(db, session_id)

    return (
        db.query(models.TaskCompletion)
        .filter(models.TaskCompletion.session_id == session_id)
        .order_by(models.TaskCompletion.id.asc())
        .all()
    )


@router.post("/complete", response_model=schemas.TaskProgressResponse)
def mark_task_complete(
    payload: schemas.TaskProgressComplete,
    db: Session = Depends(get_db),
):
    get_session_or_404(db, payload.session_id)

    evaluation = None
    if payload.completion_method == "command_match":
        evaluation = evaluate_task_attempt(
            lab_id=payload.lab_id,
            task_id=payload.task_id,
            command=payload.evidence_command or "",
            output=payload.evidence_output or "",
            terminal_assessment=payload.terminal_assessment,
            terminal_explanation=payload.terminal_explanation,
            terminal_next_step=payload.terminal_next_step,
        )
    elif payload.completion_method == "manual_confirmation":
        evaluation = {
            "status": payload.status or "completed",
            "ai_status": payload.ai_status or "manual_confirmation",
            "ai_feedback": payload.ai_feedback
            or "This task was marked complete by manual confirmation.",
            "ai_confidence": payload.ai_confidence or "high",
            "evidence_quality": payload.evidence_quality or "strong",
        }

    completion = (
        db.query(models.TaskCompletion)
        .filter(
            models.TaskCompletion.session_id == payload.session_id,
            models.TaskCompletion.lab_id == payload.lab_id,
            models.TaskCompletion.task_id == payload.task_id,
        )
        .first()
    )

    completed_at = payload.completed_at or datetime.now(timezone.utc)
    status = evaluation["status"] if evaluation else payload.status

    if completion:
        completion.status = status
        completion.completed_at = completed_at
        completion.completion_method = payload.completion_method
        completion.evidence_command = payload.evidence_command
        completion.evidence_output = payload.evidence_output
        completion.evidence_notes = payload.evidence_notes
        completion.ai_status = (
            evaluation["ai_status"] if evaluation else payload.ai_status
        )
        completion.ai_feedback = (
            evaluation["ai_feedback"] if evaluation else payload.ai_feedback
        )
        completion.ai_confidence = (
            evaluation["ai_confidence"] if evaluation else payload.ai_confidence
        )
        completion.evidence_quality = (
            evaluation["evidence_quality"]
            if evaluation
            else payload.evidence_quality
        )
    else:
        completion = models.TaskCompletion(
            session_id=payload.session_id,
            lab_id=payload.lab_id,
            task_id=payload.task_id,
            status=status,
            completed_at=completed_at,
            completion_method=payload.completion_method,
            evidence_command=payload.evidence_command,
            evidence_output=payload.evidence_output,
            evidence_notes=payload.evidence_notes,
            ai_status=evaluation["ai_status"] if evaluation else payload.ai_status,
            ai_feedback=evaluation["ai_feedback"] if evaluation else payload.ai_feedback,
            ai_confidence=evaluation["ai_confidence"]
            if evaluation
            else payload.ai_confidence,
            evidence_quality=evaluation["evidence_quality"]
            if evaluation
            else payload.evidence_quality,
        )
        db.add(completion)

    db.commit()
    db.refresh(completion)
    return completion


@router.patch(
    "/session/{session_id}/{lab_id}/{task_id}/evidence",
    response_model=schemas.TaskProgressResponse,
)
def attach_task_evidence(
    session_id: int,
    lab_id: str,
    task_id: str,
    payload: schemas.TaskProgressEvidenceUpdate,
    db: Session = Depends(get_db),
):
    get_session_or_404(db, session_id)

    completion = (
        db.query(models.TaskCompletion)
        .filter(
            models.TaskCompletion.session_id == session_id,
            models.TaskCompletion.lab_id == lab_id,
            models.TaskCompletion.task_id == task_id,
        )
        .first()
    )

    if not completion:
        raise HTTPException(status_code=404, detail="Task progress not found")

    if payload.completion_method is not None:
        completion.completion_method = payload.completion_method
    if payload.evidence_command is not None:
        completion.evidence_command = payload.evidence_command
    if payload.evidence_output is not None:
        completion.evidence_output = payload.evidence_output
    if payload.evidence_notes is not None:
        completion.evidence_notes = payload.evidence_notes
    if payload.ai_status is not None:
        completion.ai_status = payload.ai_status
    if payload.ai_feedback is not None:
        completion.ai_feedback = payload.ai_feedback
    if payload.ai_confidence is not None:
        completion.ai_confidence = payload.ai_confidence
    if payload.evidence_quality is not None:
        completion.evidence_quality = payload.evidence_quality

    db.commit()
    db.refresh(completion)
    return completion
