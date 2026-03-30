from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import findings, labs, reports, sessions, ws_terminal

app = FastAPI(
    title="Secure Stack API",
    description="Backend API for Secure Stack cyber training platform.",
    version="1.0.0",
)

# Create database tables on startup for now.
# Later, this should be replaced with Alembic migrations.
Base.metadata.create_all(bind=engine)

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
app.include_router(ws_terminal.router)


@app.get("/", tags=["Root"])
def root() -> dict[str, str]:
    return {"message": "Secure Stack API running"}


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "ok"}