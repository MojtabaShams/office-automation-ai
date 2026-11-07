"""profile avatar for applicants and staff

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-24 10:00:00.000000+00:00

The client profile page lets a user upload a small, already resized avatar. The image is
kept as a ``data:image/...;base64,`` URL in the users table so it stays available across
devices without a separate object-storage service. ``avatar`` is nullable: existing rows
keep their current look (the initial letter) until the user uploads a picture.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar")
