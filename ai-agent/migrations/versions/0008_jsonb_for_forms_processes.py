"""Convert form and process JSON payload columns to PostgreSQL JSONB."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


_CONVERSIONS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("forms", ("schema_json", "footer_links", "requirements")),
    ("form_fields", ("options",)),
    ("process_definitions", ("draft_json", "published_json")),
    ("process_versions", ("snapshot",)),
    ("process_cases", ("snapshot", "stage_states", "values", "compute_results", "timeline")),
    ("submissions", ("values", "form_snapshot")),
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table_name, columns in _CONVERSIONS:
        for column_name in columns:
            op.execute(
                sa.text(
                    f'ALTER TABLE "{table_name}" ALTER COLUMN "{column_name}" '
                    f'TYPE JSONB USING "{column_name}"::jsonb'
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table_name, columns in _CONVERSIONS:
        for column_name in columns:
            op.execute(
                sa.text(
                    f'ALTER TABLE "{table_name}" ALTER COLUMN "{column_name}" '
                    f'TYPE JSON USING "{column_name}"::json'
                )
            )
