import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.bootstrap import bootstrap_application
from app.config import settings
from app.database import check_database_health
from app.logging_config import configure_logging
from app.routers import (
    auth,
    labs,
    sessions,
    findings,
    reports,
    ws_terminal,
    task_progress,
)
from app.services.lab_launcher import check_docker_runtime

configure_logging()
logger = logging.getLogger("securestack.api")
bootstrap_application()
app = FastAPI(title="Secure Stack API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
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
    return {"status": "ok", "environment": settings.app_env}


@app.get("/health/ready")
def ready():
    database_ok, database_detail = check_database_health()
    docker_ok, docker_detail = check_docker_runtime()

    checks = {
        "database": {
            "status": "ok" if database_ok else "error",
            "detail": database_detail,
        },
        "docker_runtime": {
            "status": "ok" if docker_ok else "error",
            "detail": docker_detail,
        },
    }

    if database_ok and docker_ok:
        return {"status": "ok", "checks": checks}

    logger.warning("readiness_check_failed checks=%s", checks)
    return JSONResponse(
        status_code=503,
        content={
            "status": "degraded",
            "checks": checks,
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "validation_error path=%s errors=%s",
        request.url.path,
        exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Invalid request payload",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(
        "http_error path=%s status_code=%s detail=%s",
        request.url.path,
        exc.status_code,
        exc.detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("unhandled_error path=%s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
