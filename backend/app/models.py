from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    display_name = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    @property
    def is_instructor(self) -> bool:
        from .config import settings

        return settings.is_instructor_email(self.email)


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    lab_id = Column(String, nullable=True, index=True)
    lab_name = Column(String, nullable=False)
    status = Column(String, default="active")  # active / completed
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    environment_launched_at = Column(DateTime(timezone=True), nullable=True)
    attacker_container = Column(String, nullable=True)
    target_container = Column(String, nullable=True)
    network_name = Column(String, nullable=True)
    browser_url = Column(String, nullable=True)
    report_generated_at = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)


class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String)
    severity = Column(String)
    description = Column(String)
    source = Column(String, nullable=True)
    task_id = Column(String, nullable=True)
    task_label = Column(String, nullable=True)
    task_objective = Column(Text, nullable=True)
    evidence_command = Column(Text, nullable=True)
    evidence_snapshot = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TaskCompletion(Base):
    __tablename__ = "task_completions"
    __table_args__ = (
        UniqueConstraint("session_id", "lab_id", "task_id", name="uq_task_completion"),
    )

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    lab_id = Column(String, nullable=False, index=True)
    task_id = Column(String, nullable=False)
    status = Column(String, nullable=False, default="completed")
    completed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    completion_method = Column(String, nullable=True)
    evidence_command = Column(Text, nullable=True)
    evidence_output = Column(Text, nullable=True)
    evidence_notes = Column(Text, nullable=True)
    ai_status = Column(String, nullable=True)
    ai_feedback = Column(Text, nullable=True)
    ai_confidence = Column(String, nullable=True)
    evidence_quality = Column(String, nullable=True)


class TutorEvent(Base):
    __tablename__ = "tutor_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    lab_id = Column(String, nullable=True, index=True)
    task_id = Column(String, nullable=True, index=True)
    step_number = Column(Integer, nullable=True)
    step_title = Column(String, nullable=True)
    response_origin = Column(String, nullable=True)
    tutor_mode = Column(String, nullable=True)
    intervention_reason = Column(String, nullable=True)
    ask_intent = Column(String, nullable=True)
    learner_message = Column(Text, nullable=True)
    tutor_message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
