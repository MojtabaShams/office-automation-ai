"""soft delete everywhere and link submissions to process cases

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-25 09:00:00.000000+00:00

Two changes that the service desk needs:

* **Soft delete** — business rows (forms, process definitions, process cases, submissions,
  payment gateways, users and chat sessions) gain ``is_deleted`` / ``deleted_at``. The admin
  panel never issues ``DELETE FROM`` for these tables any more: "delete" archives the row so
  submissions, snapshots, tracking codes and audit trails keep their references.
* **Process links on submissions** — a request submitted through the applicant stepper stores
  which process and case it belongs to, plus the step it was submitted at. Admin → Requests and
  the agent can then show the process, the current step and the applicant together.

Every column is nullable or has a server default, so existing rows are preserved untouched.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Tables that only need the archival pair.
SOFT_DELETE_TABLES = (
    "forms",
    "process_definitions",
    "process_cases",
    "payment_gateways",
    "users",
    "chat_sessions",
)


def upgrade() -> None:
    # ------------------------------------------------------------- soft delete
    for table in SOFT_DELETE_TABLES:
        op.add_column(
            table,
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.create_index(f"ix_{table}_is_deleted", table, ["is_deleted"], unique=False)

    # ------------------------------------------------- submission process link
    op.add_column("submissions", sa.Column("process_id", sa.String(length=64), nullable=True))
    op.add_column("submissions", sa.Column("process_case_id", sa.String(length=64), nullable=True))
    op.add_column("submissions", sa.Column("current_stage_id", sa.String(length=64), nullable=True))
    op.add_column("submissions", sa.Column("current_stage_title", sa.String(length=200), nullable=True))
    op.add_column("submissions", sa.Column("step_index", sa.Integer(), nullable=True))
    op.add_column("submissions", sa.Column("step_count", sa.Integer(), nullable=True))
    op.add_column(
        "submissions",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("submissions", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    op.create_foreign_key(
        "fk_submissions_process_id_process_definitions",
        "submissions",
        "process_definitions",
        ["process_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_submissions_process_case_id_process_cases",
        "submissions",
        "process_cases",
        ["process_case_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_submissions_process_id", "submissions", ["process_id"], unique=False)
    op.create_index("ix_submissions_process_case_id", "submissions", ["process_case_id"], unique=False)
    op.create_index("ix_submissions_is_deleted", "submissions", ["is_deleted"], unique=False)
    op.create_index(
        "ix_submissions_process_created", "submissions", ["process_id", "created_at"], unique=False
    )

    # ------------------------------------------------ chat guidance + process
    op.add_column("chat_sessions", sa.Column("pending_process_id", sa.String(length=64), nullable=True))
    op.add_column("chat_sessions", sa.Column("guidance_stage", sa.String(length=40), nullable=True))
    op.create_foreign_key(
        "fk_chat_sessions_pending_process_id_process_definitions",
        "chat_sessions",
        "process_definitions",
        ["pending_process_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column("chat_messages", sa.Column("process_id", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "process_id")
    op.drop_constraint(
        "fk_chat_sessions_pending_process_id_process_definitions",
        "chat_sessions",
        type_="foreignkey",
    )
    op.drop_column("chat_sessions", "guidance_stage")
    op.drop_column("chat_sessions", "pending_process_id")

    op.drop_index("ix_submissions_process_created", table_name="submissions")
    op.drop_index("ix_submissions_is_deleted", table_name="submissions")
    op.drop_index("ix_submissions_process_case_id", table_name="submissions")
    op.drop_index("ix_submissions_process_id", table_name="submissions")
    op.drop_constraint("fk_submissions_process_case_id_process_cases", "submissions", type_="foreignkey")
    op.drop_constraint("fk_submissions_process_id_process_definitions", "submissions", type_="foreignkey")
    op.drop_column("submissions", "deleted_at")
    op.drop_column("submissions", "is_deleted")
    op.drop_column("submissions", "step_count")
    op.drop_column("submissions", "step_index")
    op.drop_column("submissions", "current_stage_title")
    op.drop_column("submissions", "current_stage_id")
    op.drop_column("submissions", "process_case_id")
    op.drop_column("submissions", "process_id")

    for table in reversed(SOFT_DELETE_TABLES):
        op.drop_index(f"ix_{table}_is_deleted", table_name=table)
        op.drop_column(table, "deleted_at")
        op.drop_column(table, "is_deleted")
