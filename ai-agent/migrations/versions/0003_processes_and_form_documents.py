"""process definitions, published snapshots, running cases and form documents

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-23 12:00:00.000000+00:00

* ``process_definitions`` keeps the editable draft (``draft_json``) next to the last
  published snapshot (``published_json``) so old versions keep working;
* ``process_versions`` stores one immutable JSON snapshot per publish (stages, route
  rules, computed fields, reject policy, escalation and locked form versions);
* ``process_cases`` freezes that snapshot per case and tracks stage states, the
  escalation flag and the deadline;
* ``form_documents`` stores reference documents (circulars/directives) with their
  extraction status. ``form_id`` has no foreign key on purpose: the admin panel authors
  forms locally and syncs them later.

All tables are additive; no existing row is touched.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "process_definitions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("department", sa.String(length=120), nullable=False, server_default="عمومی"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(length=40), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("version_label", sa.String(length=20), nullable=False, server_default="0.1"),
        sa.Column("draft_json", sa.JSON(), nullable=False),
        sa.Column("published_json", sa.JSON(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.String(length=64), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_process_definitions"),
    )
    op.create_index("ix_process_definitions_code", "process_definitions", ["code"])
    op.create_index("ix_process_definitions_status", "process_definitions", ["status"])

    op.create_table(
        "process_versions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("process_id", sa.String(length=64), nullable=False),
        sa.Column("version_label", sa.String(length=20), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_by", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["process_id"],
            ["process_definitions.id"],
            name="fk_process_versions_process_id_process_definitions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_process_versions"),
        sa.UniqueConstraint("process_id", "version_label", name="uq_process_versions_label"),
    )
    op.create_index("ix_process_versions_process_id", "process_versions", ["process_id"])

    op.create_table(
        "process_cases",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("tracking_code", sa.String(length=40), nullable=False),
        sa.Column("process_id", sa.String(length=64), nullable=False),
        sa.Column("process_version_label", sa.String(length=20), nullable=False, server_default="0.1"),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("applicant_id", sa.String(length=64), nullable=True),
        sa.Column("form_id", sa.String(length=64), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("substatus", sa.String(length=40), nullable=False, server_default="registered"),
        sa.Column("current_stage_id", sa.String(length=64), nullable=True),
        sa.Column("needs_escalation", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("stage_states", sa.JSON(), nullable=False),
        sa.Column("values", sa.JSON(), nullable=False),
        sa.Column("compute_results", sa.JSON(), nullable=False),
        sa.Column("timeline", sa.JSON(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["process_id"],
            ["process_definitions.id"],
            name="fk_process_cases_process_id_process_definitions",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["applicant_id"],
            ["users.id"],
            name="fk_process_cases_applicant_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_process_cases"),
        sa.UniqueConstraint("tracking_code", name="uq_process_cases_tracking_code"),
    )
    op.create_index("ix_process_cases_tracking_code", "process_cases", ["tracking_code"])
    op.create_index("ix_process_cases_process_id", "process_cases", ["process_id"])
    op.create_index("ix_process_cases_applicant_id", "process_cases", ["applicant_id"])
    op.create_index("ix_process_cases_status", "process_cases", ["status"])
    op.create_index("ix_process_cases_substatus", "process_cases", ["substatus"])
    op.create_index("ix_process_cases_needs_escalation", "process_cases", ["needs_escalation"])
    op.create_index("ix_process_cases_due_at", "process_cases", ["due_at"])

    op.create_table(
        "form_documents",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("form_id", sa.String(length=64), nullable=False),
        sa.Column("file_name", sa.String(length=300), nullable=False),
        sa.Column("mime_type", sa.String(length=150), nullable=False, server_default="application/octet-stream"),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("uploaded_by", sa.String(length=64), nullable=True),
        sa.Column("extraction_status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_form_documents"),
    )
    op.create_index("ix_form_documents_form_id", "form_documents", ["form_id"])
    op.create_index("ix_form_documents_extraction_status", "form_documents", ["extraction_status"])


def downgrade() -> None:
    op.drop_index("ix_form_documents_extraction_status", table_name="form_documents")
    op.drop_index("ix_form_documents_form_id", table_name="form_documents")
    op.drop_table("form_documents")

    op.drop_index("ix_process_cases_due_at", table_name="process_cases")
    op.drop_index("ix_process_cases_needs_escalation", table_name="process_cases")
    op.drop_index("ix_process_cases_substatus", table_name="process_cases")
    op.drop_index("ix_process_cases_status", table_name="process_cases")
    op.drop_index("ix_process_cases_applicant_id", table_name="process_cases")
    op.drop_index("ix_process_cases_process_id", table_name="process_cases")
    op.drop_index("ix_process_cases_tracking_code", table_name="process_cases")
    op.drop_table("process_cases")

    op.drop_index("ix_process_versions_process_id", table_name="process_versions")
    op.drop_table("process_versions")

    op.drop_index("ix_process_definitions_status", table_name="process_definitions")
    op.drop_index("ix_process_definitions_code", table_name="process_definitions")
    op.drop_table("process_definitions")
