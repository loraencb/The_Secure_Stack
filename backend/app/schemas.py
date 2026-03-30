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