import logging
import time

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import settings

logger = logging.getLogger("securestack.database")

DATABASE_URL = settings.database_url
database_backend = make_url(DATABASE_URL).get_backend_name()

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


def ensure_table_columns(table_name: str, expected_columns: dict[str, str]):
    with engine.begin() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())

        if table_name not in table_names:
            return

        existing_columns = {
            column["name"] for column in inspector.get_columns(table_name)
        }

        for column_name, column_type in expected_columns.items():
            if column_name in existing_columns:
                continue

            connection.execute(
                text(
                    f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
                )
            )


def ensure_session_columns():
    ensure_table_columns(
        "sessions",
        {
            "user_id": "INTEGER",
            "lab_id": "VARCHAR",
            "environment_launched_at": "DATETIME",
            "attacker_container": "VARCHAR",
            "target_container": "VARCHAR",
            "network_name": "VARCHAR",
            "browser_url": "VARCHAR",
            "report_generated_at": "DATETIME",
        },
    )


def ensure_finding_columns():
    ensure_table_columns(
        "findings",
        {
            "user_id": "INTEGER",
            "source": "VARCHAR",
            "task_id": "VARCHAR",
            "task_label": "VARCHAR",
            "task_objective": "TEXT",
            "evidence_command": "TEXT",
            "evidence_snapshot": "TEXT",
            "created_at": "DATETIME",
        },
    )


def ensure_task_completion_columns():
    ensure_table_columns(
        "task_completions",
        {
            "ai_status": "VARCHAR",
            "ai_feedback": "TEXT",
            "ai_confidence": "VARCHAR",
            "evidence_quality": "VARCHAR",
        },
    )


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


def initialize_database():
    wait_for_database()
    Base.metadata.create_all(bind=engine)
    ensure_session_columns()
    ensure_finding_columns()
    ensure_task_completion_columns()
