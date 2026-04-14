from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SessionCreate(BaseModel):
    lab_name: str


class SessionResponse(BaseModel):
    id: int
    lab_name: str
    status: str
    start_time: datetime
    end_time: Optional[datetime]

    class Config:
        from_attributes = True

class FindingCreate(BaseModel):
    session_id: int
    title: str
    severity: str
    description: str


class FindingResponse(BaseModel):
    id: int
    session_id: int
    title: str
    severity: str
    description: str

    class Config:
        from_attributes = True

class ReportResponse(BaseModel):
    session: SessionResponse
    findings: list[FindingResponse]
    summary: str


class TaskProgressBase(BaseModel):
    session_id: int
    lab_id: str
    task_id: str


class TaskProgressComplete(TaskProgressBase):
    status: str = "completed"
    completed_at: Optional[datetime] = None
    completion_method: Optional[str] = None
    evidence_command: Optional[str] = None
    evidence_output: Optional[str] = None
    evidence_notes: Optional[str] = None
    ai_status: Optional[str] = None
    ai_feedback: Optional[str] = None
    ai_confidence: Optional[str] = None
    evidence_quality: Optional[str] = None
    terminal_assessment: Optional[str] = None
    terminal_explanation: Optional[str] = None
    terminal_next_step: Optional[str] = None


class TaskProgressEvidenceUpdate(BaseModel):
    completion_method: Optional[str] = None
    evidence_command: Optional[str] = None
    evidence_output: Optional[str] = None
    evidence_notes: Optional[str] = None
    ai_status: Optional[str] = None
    ai_feedback: Optional[str] = None
    ai_confidence: Optional[str] = None
    evidence_quality: Optional[str] = None


class TaskProgressResponse(TaskProgressBase):
    id: int
    status: str
    completed_at: Optional[datetime]
    completion_method: Optional[str]
    evidence_command: Optional[str]
    evidence_output: Optional[str]
    evidence_notes: Optional[str]
    ai_status: Optional[str]
    ai_feedback: Optional[str]
    ai_confidence: Optional[str]
    evidence_quality: Optional[str]

    class Config:
        from_attributes = True
