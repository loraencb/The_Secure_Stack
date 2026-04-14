from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine, ensure_task_completion_columns
from app.routers import labs, sessions, findings, reports, ws_terminal, task_progress

app = FastAPI()

Base.metadata.create_all(bind=engine)
ensure_task_completion_columns()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(labs.router)
app.include_router(sessions.router)
app.include_router(findings.router)
app.include_router(reports.router)
app.include_router(task_progress.router)
app.include_router(ws_terminal.router)


@app.get("/")
def root():
    return {"message": "Secure Stack API running"}


@app.get("/health")
def health():
    return {"status": "ok"}
