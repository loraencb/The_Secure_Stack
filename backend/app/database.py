import logging
import time
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import settings

logger = logging.getLogger("securestack.database")

DATABASE_URL = settings.database_url
database_backend = make_url(DATABASE_URL).get_backend_name()
REQUIRED_TABLES = {
    "users",
    "auth_tokens",
    "sessions",
    "findings",
    "task_completions",
    "tutor_events",
}

engine_kwargs = {
    "pool_pre_ping": True,
}
connect_args = {}

if database_backend == "sqlite":
    connect_args["check_same_thread"] = False
else:
    engine_kwargs["pool_recycle"] = 1800

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()


def ensure_model_metadata_loaded():
    from app import models  # noqa: F401


def get_alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option(
        "script_location",
        str(backend_root / "alembic").replace("%", "%%"),
    )
    config.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))
    return config


def get_existing_table_names() -> set[str]:
    with engine.connect() as connection:
        inspector = inspect(connection)
        return set(inspector.get_table_names())


def wait_for_database():
    last_error = None

    for attempt in range(1, settings.database_connect_retries + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            if attempt > 1:
                logger.info("database_connection_restored attempt=%s", attempt)
            return
        except SQLAlchemyError as exc:
            last_error = exc
            logger.warning(
                "database_connection_retry attempt=%s/%s error=%s",
                attempt,
                settings.database_connect_retries,
                exc,
            )
            if attempt >= settings.database_connect_retries:
                break
            time.sleep(settings.database_connect_retry_delay)

    raise RuntimeError(
        "Database connection could not be established during startup"
    ) from last_error


def check_database_health() -> tuple[bool, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True, "ok"
    except SQLAlchemyError as exc:
        return False, str(exc)


def run_database_migrations():
    command.upgrade(get_alembic_config(), "head")
    logger.info("database_migrations_applied backend=%s", database_backend)


def stamp_database_head():
    command.stamp(get_alembic_config(), "head")
    logger.info("database_schema_stamped backend=%s", database_backend)


def create_schema_fallback():
    ensure_model_metadata_loaded()
    existing_tables = get_existing_table_names() - {"alembic_version"}
    if existing_tables:
        raise RuntimeError(
            "SECURESTACK_AUTO_CREATE_SCHEMA is only safe for an empty database. "
            "Run `alembic upgrade head` for existing databases."
        )

    Base.metadata.create_all(bind=engine)
    stamp_database_head()
    logger.info("database_schema_created_via_fallback backend=%s", database_backend)


def verify_database_schema():
    existing_tables = get_existing_table_names()
    missing_tables = sorted(REQUIRED_TABLES - existing_tables)

    if missing_tables:
        raise RuntimeError(
            "Database schema is incomplete. Missing tables: "
            f"{', '.join(missing_tables)}. Run `alembic upgrade head`."
        )

    if "alembic_version" not in existing_tables:
        logger.warning(
            "database_schema_untracked_by_alembic backend=%s action=stamp_head_recommended",
            database_backend,
        )


def initialize_database():
    wait_for_database()

    if settings.run_migrations_on_startup:
        run_database_migrations()
    elif settings.auto_create_schema:
        create_schema_fallback()

    verify_database_schema()
    logger.info(
        "database_initialized backend=%s migrations_on_startup=%s auto_create_schema=%s",
        database_backend,
        settings.run_migrations_on_startup,
        settings.auto_create_schema,
    )
