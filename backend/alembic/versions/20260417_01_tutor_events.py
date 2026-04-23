"""Add durable tutor events for instructor review.

Revision ID: 20260417_01
Revises: 20260415_01
Create Date: 2026-04-17 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260417_01"
down_revision = "20260415_01"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in set(_inspector().get_table_names())


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in _inspector().get_indexes(table_name)}


def _create_index_if_missing(
    table_name: str,
    index_name: str,
    columns: list[str],
    *,
    unique: bool = False,
) -> None:
    if index_name not in _index_names(table_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    if not _table_exists("tutor_events"):
        op.create_table(
            "tutor_events",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("session_id", sa.Integer(), sa.ForeignKey("sessions.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("lab_id", sa.String(), nullable=True),
            sa.Column("task_id", sa.String(), nullable=True),
            sa.Column("step_number", sa.Integer(), nullable=True),
            sa.Column("step_title", sa.String(), nullable=True),
            sa.Column("response_origin", sa.String(), nullable=True),
            sa.Column("tutor_mode", sa.String(), nullable=True),
            sa.Column("intervention_reason", sa.String(), nullable=True),
            sa.Column("ask_intent", sa.String(), nullable=True),
            sa.Column("learner_message", sa.Text(), nullable=True),
            sa.Column("tutor_message", sa.Text(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )

    _create_index_if_missing("tutor_events", "ix_tutor_events_session_id", ["session_id"])
    _create_index_if_missing("tutor_events", "ix_tutor_events_user_id", ["user_id"])
    _create_index_if_missing("tutor_events", "ix_tutor_events_lab_id", ["lab_id"])
    _create_index_if_missing("tutor_events", "ix_tutor_events_task_id", ["task_id"])


def downgrade() -> None:
    if _table_exists("tutor_events"):
        op.drop_table("tutor_events")
