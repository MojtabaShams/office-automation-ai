from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "field_guidelines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("form_id", sa.String(length=64), nullable=False),
        sa.Column("field_name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("filling_rules", sa.Text(), nullable=True),
        sa.Column("examples", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["form_id"], ["forms.id"], name=op.f("fk_field_guidelines_form_id_forms"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_field_guidelines")),
        sa.UniqueConstraint(
            "form_id", "field_name", name="uq_field_guidelines_form_field"
        ),
    )
    op.create_index(
        op.f("ix_field_guidelines_form_id"),
        "field_guidelines",
        ["form_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_field_guidelines_form_id"), table_name="field_guidelines")
    op.drop_table("field_guidelines")
