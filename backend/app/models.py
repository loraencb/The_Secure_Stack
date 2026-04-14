from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.sql import func
from .database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    lab_name = Column(String, nullable=False)
    status = Column(String, default="active")  # active / completed
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True), nullable=True)


class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    title = Column(String)
    severity = Column(String)
    description = Column(String)


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
