from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db, require_instructor_user
from app.labs.labs_config import LABS

router = APIRouter(prefix="/instructor/review", tags=["Instructor Review"])


def _history_status(session: models.Session, findings_count: int) -> str:
    if session.report_generated_at:
        return "Report generated"
    if findings_count > 0:
        return "Evidence captured"
    if session.environment_launched_at:
        return "Environment launched"
    if session.status == "completed" or session.end_time:
        return "Completed"
    return "In progress"


def _count_completed_steps(task_records: list[models.TaskCompletion]) -> int:
    return sum(1 for record in task_records if record.status == "completed")


def _count_proactive_interventions(tutor_events: list[models.TutorEvent]) -> int:
    return sum(1 for event in tutor_events if event.response_origin == "proactive_tutor")


def _count_explicit_help_requests(tutor_events: list[models.TutorEvent]) -> int:
    return sum(
        1
        for event in tutor_events
        if event.response_origin in {"ask_tutor", "tutor_chat"}
    )


def _count_idle_nudges(tutor_events: list[models.TutorEvent]) -> int:
    return sum(1 for event in tutor_events if event.intervention_reason == "idle_nudge")


def _count_off_track_events(
    task_records: list[models.TaskCompletion],
    tutor_events: list[models.TutorEvent],
) -> int:
    task_off_track = sum(1 for record in task_records if record.status == "off_track")
    tutor_off_track = sum(
        1 for event in tutor_events if event.intervention_reason == "off_track_redirect"
    )
    return task_off_track + tutor_off_track


def _get_struggle_task_ids(
    task_records: list[models.TaskCompletion],
    tutor_events: list[models.TutorEvent],
) -> set[str]:
    struggled = {
        record.task_id
        for record in task_records
        if record.task_id
        and (
            record.status in {"attempted", "off_track"}
            or (record.evidence_quality or "").lower() in {"weak", "none", "partial"}
        )
    }

    tutor_events_by_task: dict[str, list[models.TutorEvent]] = defaultdict(list)
    for event in tutor_events:
        if event.task_id:
            tutor_events_by_task[event.task_id].append(event)

    for task_id, events in tutor_events_by_task.items():
        if len(events) >= 2 or any(
            event.intervention_reason in {"idle_nudge", "off_track_redirect", "stuck_intervention"}
            for event in events
        ):
            struggled.add(task_id)

    return struggled


def _support_level(
    task_records: list[models.TaskCompletion],
    tutor_events: list[models.TutorEvent],
) -> str:
    tutor_count = len(tutor_events)
    off_track_count = _count_off_track_events(task_records, tutor_events)
    struggle_steps = len(_get_struggle_task_ids(task_records, tutor_events))

    if tutor_count == 0 and off_track_count == 0 and struggle_steps == 0:
        return "Independent"
    if tutor_count <= 2 and off_track_count <= 1 and struggle_steps <= 1:
        return "Light support"
    return "Support-heavy"


def _task_records_for_session(
    db: Session,
    session_id: int,
) -> list[models.TaskCompletion]:
    return (
        db.query(models.TaskCompletion)
        .filter(models.TaskCompletion.session_id == session_id)
        .order_by(models.TaskCompletion.id.asc())
        .all()
    )


def _tutor_events_for_session(
    db: Session,
    session_id: int,
) -> list[models.TutorEvent]:
    return (
        db.query(models.TutorEvent)
        .filter(models.TutorEvent.session_id == session_id)
        .order_by(models.TutorEvent.created_at.asc(), models.TutorEvent.id.asc())
        .all()
    )


def _findings_for_session(
    db: Session,
    session_id: int,
) -> list[models.Finding]:
    return (
        db.query(models.Finding)
        .filter(models.Finding.session_id == session_id)
        .order_by(models.Finding.created_at.desc(), models.Finding.id.desc())
        .all()
    )


def _build_session_summary(
    session: models.Session,
    student: models.User | None,
    task_records: list[models.TaskCompletion],
    tutor_events: list[models.TutorEvent],
    findings: list[models.Finding],
) -> schemas.InstructorReviewSessionSummary:
    tasks = (LABS.get(session.lab_id) or {}).get("tasks", [])
    findings_count = len(findings)

    return schemas.InstructorReviewSessionSummary(
        id=session.id,
        student_user_id=student.id if student else session.user_id or 0,
        student_display_name=(
            student.display_name
            if student and student.display_name
            else (student.email.split("@", 1)[0] if student and student.email else "Unknown student")
        ),
        student_email=student.email if student and student.email else "Unknown",
        lab_id=session.lab_id,
        lab_name=session.lab_name,
        status=session.status,
        start_time=session.start_time,
        environment_launched_at=session.environment_launched_at,
        report_generated_at=session.report_generated_at,
        end_time=session.end_time,
        findings_count=findings_count,
        completed_steps=_count_completed_steps(task_records),
        total_steps=len(tasks),
        tutor_interventions=len(tutor_events),
        proactive_interventions=_count_proactive_interventions(tutor_events),
        explicit_help_requests=_count_explicit_help_requests(tutor_events),
        idle_nudges=_count_idle_nudges(tutor_events),
        off_track_events=_count_off_track_events(task_records, tutor_events),
        struggle_steps=len(_get_struggle_task_ids(task_records, tutor_events)),
        history_status=_history_status(session, findings_count),
        support_level=_support_level(task_records, tutor_events),
    )


def _build_step_summaries(
    session: models.Session,
    task_records: list[models.TaskCompletion],
    tutor_events: list[models.TutorEvent],
) -> list[schemas.InstructorReviewStepSummary]:
    lab_tasks = (LABS.get(session.lab_id) or {}).get("tasks", [])
    task_record_map = {record.task_id: record for record in task_records}
    tutor_events_by_task: dict[str, list[models.TutorEvent]] = defaultdict(list)

    for event in tutor_events:
        if event.task_id:
            tutor_events_by_task[event.task_id].append(event)

    summaries: list[schemas.InstructorReviewStepSummary] = []

    for index, task in enumerate(lab_tasks):
        task_id = task.get("task_id")
        if not task_id:
            continue

        record = task_record_map.get(task_id)
        step_events = tutor_events_by_task.get(task_id, [])
        latest_tutor_message = step_events[-1].tutor_message if step_events else None
        support_level = _support_level(
            [record] if record else [],
            step_events,
        )

        summaries.append(
            schemas.InstructorReviewStepSummary(
                task_id=task_id,
                step_number=index + 1,
                title=task.get("title") or f"Step {index + 1}",
                objective=(
                    task.get("objective")
                    or task.get("instruction")
                    or task.get("explanation")
                    or ""
                ),
                status=record.status if record else "pending",
                completed_at=record.completed_at if record else None,
                completion_method=record.completion_method if record else None,
                evidence_command=record.evidence_command if record else None,
                evidence_quality=record.evidence_quality if record else None,
                ai_status=record.ai_status if record else None,
                ai_feedback=record.ai_feedback if record else None,
                tutor_interventions=len(step_events),
                proactive_interventions=_count_proactive_interventions(step_events),
                explicit_help_requests=_count_explicit_help_requests(step_events),
                idle_nudges=_count_idle_nudges(step_events),
                off_track_events=_count_off_track_events(
                    [record] if record else [],
                    step_events,
                ),
                support_level=support_level,
                latest_tutor_message=latest_tutor_message,
            )
        )

    return summaries


@router.get("/sessions", response_model=list[schemas.InstructorReviewSessionSummary])
def list_review_sessions(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_instructor_user),
):
    sessions = (
        db.query(models.Session)
        .order_by(models.Session.start_time.desc(), models.Session.id.desc())
        .all()
    )
    users = {
        user.id: user
        for user in db.query(models.User).all()
    }

    summaries: list[schemas.InstructorReviewSessionSummary] = []
    for session in sessions:
        task_records = _task_records_for_session(db, session.id)
        tutor_events = _tutor_events_for_session(db, session.id)
        findings = _findings_for_session(db, session.id)
        summaries.append(
            _build_session_summary(
                session,
                users.get(session.user_id),
                task_records,
                tutor_events,
                findings,
            )
        )

    return summaries


@router.get(
    "/sessions/{session_id}",
    response_model=schemas.InstructorReviewDetailResponse,
)
def get_review_session_detail(
    session_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_instructor_user),
):
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    student = (
        db.query(models.User).filter(models.User.id == session.user_id).first()
        if session.user_id
        else None
    )
    task_records = _task_records_for_session(db, session.id)
    tutor_events = _tutor_events_for_session(db, session.id)
    findings = _findings_for_session(db, session.id)

    return schemas.InstructorReviewDetailResponse(
        session=_build_session_summary(
            session,
            student,
            task_records,
            tutor_events,
            findings,
        ),
        step_summaries=_build_step_summaries(session, task_records, tutor_events),
        tutor_events=tutor_events,
        findings=findings,
    )
