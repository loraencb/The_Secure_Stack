import logging

from app.config import settings
from app.database import SessionLocal, initialize_database
from app.services.lab_cleanup import cleanup_stale_lab_resources

logger = logging.getLogger("securestack.bootstrap")


def bootstrap_application():
    settings.validate()
    logger.info(
        "application_bootstrap_start env=%s api_port=%s database_backend=%s docker_host=%s run_migrations_on_startup=%s auto_create_schema=%s",
        settings.app_env,
        settings.api_port,
        settings.database_url.split(":", 1)[0],
        settings.docker_host or "from_env",
        settings.run_migrations_on_startup,
        settings.auto_create_schema,
    )
    for warning in settings.startup_warnings():
        logger.warning("configuration_warning message=%s", warning)
    initialize_database()
    if settings.cleanup_stale_labs_on_startup:
        db = SessionLocal()
        try:
            cleanup_result = cleanup_stale_lab_resources(db)
            logger.info(
                "startup_lab_cleanup_complete status=%s sessions_reconciled=%s removed=%s missing=%s errors=%s",
                cleanup_result.get("status"),
                cleanup_result.get("sessions_reconciled", 0),
                cleanup_result.get("removed_count", 0),
                cleanup_result.get("missing_count", 0),
                cleanup_result.get("error_count", 0),
            )
        except Exception as exc:
            db.rollback()
            logger.warning("startup_lab_cleanup_failed error=%s", exc)
        finally:
            db.close()
    logger.info("application_bootstrap_complete")


if __name__ == "__main__":
    bootstrap_application()
