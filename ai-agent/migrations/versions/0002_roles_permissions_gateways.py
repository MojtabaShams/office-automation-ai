"""roles, permissions, payment gateways and richer user profiles

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-23 09:10:00.000000+00:00

* creates ``roles`` / ``role_permissions`` (an ``(resource, action)`` matrix) and
  ``payment_gateways``;
* extends ``users`` with ``email``, ``unit``, ``role_id`` and ``last_login_at``;
* seeds the three system roles and backfills ``role_id`` from the legacy
  ``users.role`` string before dropping that column.

Existing rows are preserved: every account keeps its old role semantics
(``admin`` → ``super_admin``, ``employee`` → ``employee``, anything else →
``applicant``).
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# --------------------------------------------------------------------------- seed data
# Snapshot of ``app.core.permissions`` at the time of this migration. Keeping a copy
# here means the migration stays reproducible even if the catalog evolves later.
RESOURCE_ACTIONS: dict[str, tuple[str, ...]] = {
    "admin_panel": ("view",),
    "employees": ("view", "create", "update", "delete"),
    "roles": ("view", "create", "update", "delete"),
    "forms": ("view", "create", "update", "delete", "publish"),
    "processes": ("view", "create", "update", "delete"),
    "requests": ("view", "update", "delete"),
    "calendar": ("view", "create", "update", "delete"),
    "messages": ("view", "create"),
    "reports": ("view", "create", "update", "delete"),
    "settings": ("view", "update"),
    "payment_gateways": ("view", "create", "update", "delete"),
}

EMPLOYEE_GRANTS: tuple[tuple[str, str], ...] = (
    ("admin_panel", "view"),
    ("employees", "view"),
    ("roles", "view"),
    ("forms", "view"),
    ("processes", "view"),
    ("requests", "view"),
    ("requests", "update"),
    ("calendar", "view"),
    ("calendar", "create"),
    ("calendar", "update"),
    ("messages", "view"),
    ("messages", "create"),
    ("reports", "view"),
    ("settings", "view"),
    ("payment_gateways", "view"),
)

ROLE_DEFINITIONS = (
    {
        "id": "role-super-admin",
        "code": "super_admin",
        "name": "مدیر کل سامانه",
        "description": "دسترسی کامل به همه بخش‌های پنل مدیریت.",
        "is_system": True,
        "grants": tuple((resource, action) for resource, actions in RESOURCE_ACTIONS.items() for action in actions),
    },
    {
        "id": "role-employee",
        "code": "employee",
        "name": "کارشناس",
        "description": "دسترسی به کارتابل، فرم‌ها و بررسی درخواست‌ها.",
        "is_system": True,
        "grants": EMPLOYEE_GRANTS,
    },
    {
        "id": "role-applicant",
        "code": "applicant",
        "name": "مراجع",
        "description": "دسترسی به میز خدمت و پیگیری درخواست‌های شخصی.",
        "is_system": True,
        "grants": (),
    },
)


def upgrade() -> None:
    now = datetime.now(timezone.utc)

    # ------------------------------------------------------------------ roles
    op.create_table(
        "roles",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
    )
    op.create_index(op.f("ix_roles_code"), "roles", ["code"], unique=True)

    op.create_table(
        "role_permissions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("role_id", sa.String(length=64), nullable=False),
        sa.Column("resource", sa.String(length=50), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"], name=op.f("fk_role_permissions_role_id_roles"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_role_permissions")),
        sa.UniqueConstraint(
            "role_id", "resource", "action", name="uq_role_permissions_role_id_resource_action"
        ),
    )
    op.create_index(op.f("ix_role_permissions_role_id"), "role_permissions", ["role_id"], unique=False)

    # -------------------------------------------------------- payment gateways
    op.create_table(
        "payment_gateways",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("bank_name", sa.String(length=120), nullable=False),
        sa.Column("connection_key", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_gateways")),
    )
    op.create_index(
        op.f("ix_payment_gateways_is_active"), "payment_gateways", ["is_active"], unique=False
    )

    # ------------------------------------------------------- user profile cols
    op.add_column("users", sa.Column("email", sa.String(length=200), nullable=True))
    op.add_column("users", sa.Column("unit", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("role_id", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_role_id"), "users", ["role_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_users_role_id_roles"), "users", "roles", ["role_id"], ["id"], ondelete="SET NULL"
    )

    # ------------------------------------------------------------- seed roles
    roles_table = sa.table(
        "roles",
        sa.column("id", sa.String),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("is_system", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    permissions_table = sa.table(
        "role_permissions",
        sa.column("role_id", sa.String),
        sa.column("resource", sa.String),
        sa.column("action", sa.String),
    )

    bind = op.get_bind()
    for definition in ROLE_DEFINITIONS:
        exists = bind.execute(
            sa.text("SELECT 1 FROM roles WHERE code = :code"), {"code": definition["code"]}
        ).first()
        if exists:
            continue
        bind.execute(
            roles_table.insert().values(
                id=definition["id"],
                code=definition["code"],
                name=definition["name"],
                description=definition["description"],
                is_system=definition["is_system"],
                created_at=now,
                updated_at=now,
            )
        )
        for resource, action in definition["grants"]:
            bind.execute(
                permissions_table.insert().values(
                    role_id=definition["id"], resource=resource, action=action
                )
            )

    # ------------------------------------------------- backfill from users.role
    bind.execute(
        sa.text(
            """
            UPDATE users SET role_id = CASE
                WHEN role IN ('admin', 'super_admin') THEN 'role-super-admin'
                WHEN role = 'employee' THEN 'role-employee'
                ELSE 'role-applicant'
            END
            """
        )
    )

    # The legacy string column is superseded by ``role_id``.
    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_column("users", "role")


def downgrade() -> None:
    # Restore the legacy column and mirror the current role code into it.
    op.add_column("users", sa.Column("role", sa.String(length=20), nullable=True))
    op.execute(
        """
        UPDATE users u SET role = r.code
        FROM roles r
        WHERE u.role_id = r.id
        """
    )
    op.execute("UPDATE users SET role = 'applicant' WHERE role IS NULL")
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'super_admin'")
    op.alter_column("users", "role", nullable=False)
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)

    op.drop_constraint(op.f("fk_users_role_id_roles"), "users", type_="foreignkey")
    op.drop_index(op.f("ix_users_role_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_column("users", "role_id")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "unit")
    op.drop_column("users", "email")

    op.drop_index(op.f("ix_payment_gateways_is_active"), table_name="payment_gateways")
    op.drop_table("payment_gateways")

    op.drop_index(op.f("ix_role_permissions_role_id"), table_name="role_permissions")
    op.drop_table("role_permissions")
    op.drop_index(op.f("ix_roles_code"), table_name="roles")
    op.drop_table("roles")
