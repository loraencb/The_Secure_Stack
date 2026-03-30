from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from .database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)

    lab_name = Column(String, nullable=False)
    status = Column(String, default="active")  # active / completed / stopped

    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    findings = relationship("Finding", back_populates="session", cascade="all, delete")
    commands = relationship("Command", back_populates="session", cascade="all, delete")
    ai_observations = relationship("AIObservation", back_populates="session", cascade="all, delete")


class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)

    session_id = Column(Integer, ForeignKey("sessions.id"))

    title = Column(String)
    severity = Column(String)
    description = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    session = relationship("Session", back_populates="findings")


# NEW: Track terminal commands
class Command(Base):
    __tablename__ = "commands"

    id = Column(Integer, primary_key=True, index=True)

    session_id = Column(Integer, ForeignKey("sessions.id"))

    command_text = Column(Text, nullable=False)
    output = Column(Text, nullable=True)
    exit_code = Column(Integer, nullable=True)

    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    session = relationship("Session", back_populates="commands")


# NEW: AI real-time coaching feedback
class AIObservation(Base):
    __tablename__ = "ai_observations"

    id = Column(Integer, primary_key=True, index=True)

    session_id = Column(Integer, ForeignKey("sessions.id"))

    observation_type = Column(String)  # explanation, guidance, warning, reinforcement
    message = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    session = relationship("Session", back_populates="ai_observations")