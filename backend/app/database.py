import os
import tempfile
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker


def get_default_database_url() -> str:
    configured_url = os.getenv("SECURESTACK_DATABASE_URL")
    if configured_url:
        return configured_url

    configured_path = os.getenv("SECURESTACK_DATABASE_PATH")
    if configured_path:
        db_path = Path(configured_path).expanduser()
    else:
        db_path = Path(tempfile.gettempdir()) / "SecureStack" / "securestack.db"

    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


DATABASE_URL = get_default_database_url()

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()


def ensure_task_completion_columns():
    expected_columns = {
        "ai_status": "VARCHAR",
        "ai_feedback": "TEXT",
        "ai_confidence": "VARCHAR",
        "evidence_quality": "VARCHAR",
    }

    with engine.begin() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())

        if "task_completions" not in table_names:
            return

        existing_columns = {
            column["name"] for column in inspector.get_columns("task_completions")
        }

        for column_name, column_type in expected_columns.items():
            if column_name in existing_columns:
                continue

            connection.execute(
                text(
                    f"ALTER TABLE task_completions ADD COLUMN {column_name} {column_type}"
                )
            )
