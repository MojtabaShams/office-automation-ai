"""let employees author forms and processes

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-25 10:00:00.000000+00:00

The service desk flow starts with an employee designing forms and the process stages in
the admin panel. Until now ``employee`` only had ``forms:view`` and ``processes:view``, so
only a super admin could save a definition. This migration adds the authoring actions
(create/update/delete/publish for forms, create/update/delete for processes, delete for
requests) to the *system* employee role.

Custom roles are untouched: only the role whose code is ``employee`` is granted. Existing
grants are preserved because the inserts are idempotent.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EMPLOYEE_ROLE_ID = "role-employee"

EMPLOYEE_AUTHORING_GRANTS: tuple[tuple[str, str], ...] = (
    ("forms", "create"),
    ("forms", "update"),
    ("forms", "delete"),
    ("forms", "publish"),
    ("processes", "create"),
    ("processes", "update"),
    ("processes", "delete"),
    ("requests", "delete"),
)


def upgrade() -> None:
    bind = op.get_bind()
    for resource, action in EMPLOYEE_AUTHORING_GRANTS:
        exists = bind.execute(
            sa.text(
                """
                SELECT 1 FROM role_permissions
                WHERE role_id = :role_id AND resource = :resource AND action = :action
                """
            ),
            {"role_id": EMPLOYEE_ROLE_ID, "resource": resource, "action": action},
        ).first()
        if exists:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO role_permissions (role_id, resource, action)
                VALUES (:role_id, :resource, :action)
                """
            ),
            {"role_id": EMPLOYEE_ROLE_ID, "resource": resource, "action": action},
        )


def downgrade() -> None:
    bind = op.get_bind()
    for resource, action in EMPLOYEE_AUTHORING_GRANTS:
        bind.execute(
            sa.text(
                """
                DELETE FROM role_permissions
                WHERE role_id = :role_id AND resource = :resource AND action = :action
                """
            ),
            {"role_id": EMPLOYEE_ROLE_ID, "resource": resource, "action": action},
        )
