from pydantic import BaseModel, Field
from typing import Any, Optional
from datetime import datetime


class UserCreate(BaseModel):
    email: str
    password: str = Field(min_length=8)
    display_name: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: Optional[str]
    created_at: datetime
    last_login_at: Optional[datetime]

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    expires_at: datetime
    user: UserResponse


class SessionCreate(BaseModel):
    lab_name: str
    lab_id: Optional[str] = None


class SessionResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    lab_id: Optional[str]
    lab_name: str
    status: str
    start_time: datetime
    environment_launched_at: Optional[datetime]
    attacker_container: Optional[str]
    target_container: Optional[str]
    network_name: Optional[str]
    browser_url: Optional[str]
    report_generated_at: Optional[datetime]
    end_time: Optional[datetime]

    class Config:
        from_attributes = True


class SessionHistoryResponse(BaseModel):
    id: int
    lab_id: Optional[str]
    lab_name: str
    status: str
    start_time: datetime
    environment_launched_at: Optional[datetime]
    report_generated_at: Optional[datetime]
    attacker_container: Optional[str]
    target_container: Optional[str]
    findings_count: int = 0
    history_status: str


class FindingCreate(BaseModel):
    session_id: int
    title: str
    severity: str
    description: str
    source: Optional[str] = None
    task_id: Optional[str] = None
    task_label: Optional[str] = None
    task_objective: Optional[str] = None
    evidence_command: Optional[str] = None
    evidence_snapshot: Optional[str] = None


class FindingResponse(BaseModel):
    id: int
    session_id: int
    user_id: Optional[int] = None
    title: str
    severity: str
    description: str
    source: Optional[str]
    task_id: Optional[str]
    task_label: Optional[str]
    task_objective: Optional[str]
    evidence_command: Optional[str]
    evidence_snapshot: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True

class ReportResponse(BaseModel):
    session: SessionResponse
    findings: list[FindingResponse]
    analysis: Optional[dict[str, Any]] = None


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
