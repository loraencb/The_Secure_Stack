from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SessionCreate(BaseModel):
    lab_name: str


class SessionResponse(BaseModel):
    id: int
    lab_name: str
    status: str
    start_time: datetime
    end_time: Optional[datetime] = None

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
    created_at: datetime

    class Config:
        from_attributes = True


class CommandCreate(BaseModel):
    session_id: int
    command_text: str
    output: Optional[str] = None
    exit_code: Optional[int] = None


class CommandResponse(BaseModel):
    id: int
    session_id: int
    command_text: str
    output: Optional[str] = None
    exit_code: Optional[int] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class AIObservationCreate(BaseModel):
    session_id: int
    observation_type: str
    message: str


class AIObservationResponse(BaseModel):
    id: int
    session_id: int
    observation_type: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


class ReportResponse(BaseModel):
    session: SessionResponse
    findings: list[FindingResponse]
    commands: list[CommandResponse] = []
    ai_observations: list[AIObservationResponse] = []
    summary: str