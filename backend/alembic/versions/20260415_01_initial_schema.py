"""Initial Secure Stack schema baseline.

Revision ID: 20260415_01
Revises:
Create Date: 2026-04-15 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260415_01"
down_revision = None
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in set(_inspector().get_table_names())


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in _inspector().get_indexes(table_name)}


def _unique_names(table_name: str) -> set[str]:
    return {
        constraint["name"]
        for constraint in _inspector().get_unique_constraints(table_name)
        if constraint.get("name")
    }


def _add_column_if_missing(table_name: str, column_name: str, column: sa.Column) -> None:
    if column_name not in _column_names(table_name):
        op.add_column(table_name, column)


def _create_index_if_missing(
    table_name: str,
    index_name: str,
    columns: list[str],
    *,
    unique: bool = False,
) -> None:
    if index_name not in _index_names(table_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def _create_unique_constraint_if_missing(
    table_name: str,
    constraint_name: str,
    columns: list[str],
) -> None:
    if constraint_name in _unique_names(table_name):
        return

    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.create_unique_constraint(constraint_name, columns)
        return

    op.create_unique_constraint(constraint_name, table_name, columns)


def upgrade() -> None:
    if not _table_exists("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("display_name", sa.String(), nullable=True),
            sa.Column("password_hash", sa.String(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        )
    else:
        _add_column_if_missing("users", "email", sa.Column("email", sa.String(), nullable=False))
        _add_column_if_missing(
            "users",
            "display_name",
            sa.Column("display_name", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "users",
            "password_hash",
            sa.Column("password_hash", sa.String(), nullable=False),
        )
        _add_column_if_missing(
            "users",
            "created_at",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )
        _add_column_if_missing(
            "users",
            "last_login_at",
            sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        )

    _create_index_if_missing("users", "ix_users_email", ["email"], unique=True)

    if not _table_exists("auth_tokens"):
        op.create_table(
            "auth_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("token_hash", sa.String(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        )
    else:
        _add_column_if_missing(
            "auth_tokens",
            "user_id",
            sa.Column("user_id", sa.Integer(), nullable=False),
        )
        _add_column_if_missing(
            "auth_tokens",
            "token_hash",
            sa.Column("token_hash", sa.String(), nullable=False),
        )
        _add_column_if_missing(
            "auth_tokens",
            "created_at",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )
        _add_column_if_missing(
            "auth_tokens",
            "expires_at",
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        )
        _add_column_if_missing(
            "auth_tokens",
            "revoked_at",
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        )

    _create_index_if_missing("auth_tokens", "ix_auth_tokens_user_id", ["user_id"])
    _create_index_if_missing(
        "auth_tokens",
        "ix_auth_tokens_token_hash",
        ["token_hash"],
        unique=True,
    )

    if not _table_exists("sessions"):
        op.create_table(
            "sessions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("lab_id", sa.String(), nullable=True),
            sa.Column("lab_name", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=True, server_default="active"),
            sa.Column(
                "start_time",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column("environment_launched_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("attacker_container", sa.String(), nullable=True),
            sa.Column("target_container", sa.String(), nullable=True),
            sa.Column("network_name", sa.String(), nullable=True),
            sa.Column("browser_url", sa.String(), nullable=True),
            sa.Column("report_generated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        )
    else:
        _add_column_if_missing(
            "sessions",
            "user_id",
            sa.Column("user_id", sa.Integer(), nullable=True),
        )
        _add_column_if_missing(
            "sessions",
            "lab_id",
            sa.Column("lab_id", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "sessions",
            "status",
            sa.Column("status", sa.String(), nullable=True, server_default="active"),
        )
        _add_column_if_missing(
            "sessions",
            "environment_launched_at",
            sa.Column("environment_launched_at", sa.DateTime(timezone=True), nullable=True),
        )
        _add_column_if_missing(
            "sessions",
            "attacker_container",
            sa.Column("attacker_container", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "sessions",
            "target_container",
            sa.Column("target_container", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "sessions",
            "network_name",
            sa.Column("network_name", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "sessions",
            "browser_url",
            sa.Column("browser_url", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "sessions",
            "report_generated_at",
            sa.Column("report_generated_at", sa.DateTime(timezone=True), nullable=True),
        )
        _add_column_if_missing(
            "sessions",
            "end_time",
            sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        )

    _create_index_if_missing("sessions", "ix_sessions_user_id", ["user_id"])
    _create_index_if_missing("sessions", "ix_sessions_lab_id", ["lab_id"])

    if not _table_exists("findings"):
        op.create_table(
            "findings",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("session_id", sa.Integer(), sa.ForeignKey("sessions.id"), nullable=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("title", sa.String(), nullable=True),
            sa.Column("severity", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("source", sa.String(), nullable=True),
            sa.Column("task_id", sa.String(), nullable=True),
            sa.Column("task_label", sa.String(), nullable=True),
            sa.Column("task_objective", sa.Text(), nullable=True),
            sa.Column("evidence_command", sa.Text(), nullable=True),
            sa.Column("evidence_snapshot", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )
    else:
        _add_column_if_missing(
            "findings",
            "user_id",
            sa.Column("user_id", sa.Integer(), nullable=True),
        )
        _add_column_if_missing(
            "findings",
            "source",
            sa.Column("source", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "findings",
            "task_id",
            sa.Column("task_id", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "findings",
            "task_label",
            sa.Column("task_label", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "findings",
            "task_objective",
            sa.Column("task_objective", sa.Text(), nullable=True),
        )
        _add_column_if_missing(
            "findings",
            "evidence_command",
            sa.Column("evidence_command", sa.Text(), nullable=True),
        )
        _add_column_if_missing(
            "findings",
            "evidence_snapshot",
            sa.Column("evidence_snapshot", sa.Text(), nullable=True),
        )
        _add_column_if_missing(
            "findings",
            "created_at",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )

    _create_index_if_missing("findings", "ix_findings_user_id", ["user_id"])

    if not _table_exists("task_completions"):
        op.create_table(
            "task_completions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("session_id", sa.Integer(), sa.ForeignKey("sessions.id"), nullable=False),
            sa.Column("lab_id", sa.String(), nullable=False),
            sa.Column("task_id", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="completed"),
            sa.Column(
                "completed_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column("completion_method", sa.String(), nullable=True),
            sa.Column("evidence_command", sa.Text(), nullable=True),
            sa.Column("evidence_output", sa.Text(), nullable=True),
            sa.Column("evidence_notes", sa.Text(), nullable=True),
            sa.Column("ai_status", sa.String(), nullable=True),
            sa.Column("ai_feedback", sa.Text(), nullable=True),
            sa.Column("ai_confidence", sa.String(), nullable=True),
            sa.Column("evidence_quality", sa.String(), nullable=True),
            sa.UniqueConstraint(
                "session_id",
                "lab_id",
                "task_id",
                name="uq_task_completion",
            ),
        )
    else:
        _add_column_if_missing(
            "task_completions",
            "completion_method",
            sa.Column("completion_method", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "task_completions",
            "evidence_command",
            sa.Column("evidence_command", sa.Text(), nullable=True),
        )
        _add_column_if_missing(
            "task_completions",
            "evidence_output",
            sa.Column("evidence_output", sa.Text(), nullable=True),
        )
        _add_column_if_missing(
            "task_completions",
            "evidence_notes",
            sa.Column("evidence_notes", sa.Text(), nullable=True),
        )
        _add_column_if_missing(
            "task_completions",
            "ai_status",
            sa.Column("ai_status", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "task_completions",
            "ai_feedback",
            sa.Column("ai_feedback", sa.Text(), nullable=True),
        )
        _add_column_if_missing(
            "task_completions",
            "ai_confidence",
            sa.Column("ai_confidence", sa.String(), nullable=True),
        )
        _add_column_if_missing(
            "task_completions",
            "evidence_quality",
            sa.Column("evidence_quality", sa.String(), nullable=True),
        )

    _create_index_if_missing(
        "task_completions",
        "ix_task_completions_session_id",
        ["session_id"],
    )
    _create_index_if_missing(
        "task_completions",
        "ix_task_completions_lab_id",
        ["lab_id"],
    )
    _create_unique_constraint_if_missing(
        "task_completions",
        "uq_task_completion",
        ["session_id", "lab_id", "task_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "task_completions" in existing_tables:
        op.drop_table("task_completions")
    if "findings" in existing_tables:
        op.drop_table("findings")
    if "auth_tokens" in existing_tables:
        op.drop_table("auth_tokens")
    if "sessions" in existing_tables:
        op.drop_table("sessions")
    if "users" in existing_tables:
        op.drop_table("users")
