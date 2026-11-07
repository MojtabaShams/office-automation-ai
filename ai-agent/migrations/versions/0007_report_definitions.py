"""saved report definitions

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-25 17:00:00.000000+00:00

The admin report builder used to persist its definitions in the browser's
localStorage. This migration gives it a real home in PostgreSQL with the same
soft-delete contract as the rest of the domain tables (``is_deleted`` /
``deleted_at``) and seeds two clearly marked demo reports so the "my reports"
tab is demonstrable on a fresh database.
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: ``created_by`` marker so seed rows are recognisable and can be removed safely.
SEED_AUTHOR = "seed-demo"

SEED_REPORTS: tuple[dict, ...] = (
    {
        "id": "rpt-seed-emp-by-role",
        "title": "تعداد کارمندان به‌تفکیک نقش (داده نمونه)",
        "description": "شمارش کارمندان فعال و غیرفعال بر اساس نقش شغلی — داده نمونه برای نمایش گزارش‌ها",
        "category": "منابع انسانی",
        "entity_id": "employees",
        "definition": {
            "id": "rpt-seed-emp-by-role",
            "title": "تعداد کارمندان به‌تفکیک نقش (داده نمونه)",
            "description": "شمارش کارمندان فعال و غیرفعال بر اساس نقش شغلی — داده نمونه برای نمایش گزارش‌ها",
            "category": "منابع انسانی",
            "entityId": "employees",
            "groupBy": [{"fieldId": "role"}],
            "metrics": [{"id": "m-count", "kind": "aggregate", "fn": "count", "label": "تعداد"}],
            "display": {"type": "table", "xFieldId": "role", "yMetricIds": ["m-count"]},
            "updatedAt": "2026-10-20T10:00:00",
        },
    },
    {
        "id": "rpt-seed-req-status",
        "title": "توزیع وضعیت درخواست‌ها (داده نمونه)",
        "description": "تعداد درخواست‌ها بر اساس وضعیت جاری — داده نمونه برای نمایش گزارش‌ها",
        "category": "درخواست‌ها",
        "entity_id": "requests",
        "definition": {
            "id": "rpt-seed-req-status",
            "title": "توزیع وضعیت درخواست‌ها (داده نمونه)",
            "description": "تعداد درخواست‌ها بر اساس وضعیت جاری — داده نمونه برای نمایش گزارش‌ها",
            "category": "درخواست‌ها",
            "entityId": "requests",
            "groupBy": [{"fieldId": "statusLabel"}],
            "metrics": [{"id": "m-count", "kind": "aggregate", "fn": "count", "label": "تعداد"}],
            "display": {"type": "bar", "xFieldId": "statusLabel", "yMetricIds": ["m-count"]},
            "updatedAt": "2026-10-20T10:00:00",
        },
    },
)


def upgrade() -> None:
    op.create_table(
        "report_definitions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("category", sa.String(length=80), nullable=False, server_default="عمومی"),
        sa.Column("entity_id", sa.String(length=64), nullable=False),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_report_definitions")),
    )
    op.create_index(
        op.f("ix_report_definitions_entity_id"), "report_definitions", ["entity_id"], unique=False
    )
    op.create_index(
        op.f("ix_report_definitions_is_deleted"), "report_definitions", ["is_deleted"], unique=False
    )

    # Demo rows so "my reports" is not empty; marked with ``SEED_AUTHOR``.
    table = sa.table(
        "report_definitions",
        sa.column("id", sa.String),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("category", sa.String),
        sa.column("entity_id", sa.String),
        sa.column("definition", sa.JSON),
        sa.column("created_by", sa.String),
        sa.column("is_deleted", sa.Boolean),
    )
    for row in SEED_REPORTS:
        op.bulk_insert(
            table,
            [
                {
                    **row,
                    "created_by": SEED_AUTHOR,
                    "is_deleted": False,
                }
            ],
        )
    print("seeded report_definitions:", json.dumps([row["id"] for row in SEED_REPORTS]))


def downgrade() -> None:
    op.drop_index(op.f("ix_report_definitions_is_deleted"), table_name="report_definitions")
    op.drop_index(op.f("ix_report_definitions_entity_id"), table_name="report_definitions")
    op.drop_table("report_definitions")
