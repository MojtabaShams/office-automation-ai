"""Permission catalog shared by the API, the seed data and the admin UI.

A permission is a ``(resource, action)`` pair stored in ``role_permissions``. The
catalog below is the single source of truth: ``GET /api/roles/catalog`` returns it so
the admin panel renders the matrix without hard-coding the modules.

Roles:
* ``super_admin`` – every permission (system role, cannot be deleted)
* ``employee``   – the admin panel plus day-to-day review work
* ``applicant``  – no admin access; only the chat/applicant side
"""

from __future__ import annotations

from typing import Any, Iterable

RESOURCE_LABELS: dict[str, str] = {
    "admin_panel": "پنل مدیریت",
    "employees": "کارمندان",
    "roles": "نقش‌ها و دسترسی‌ها",
    "forms": "فرم‌ها",
    "processes": "پروسه‌ها",
    "requests": "درخواست‌ها",
    "calendar": "تقویم کاری",
    "messages": "پیام‌ها",
    "reports": "گزارشات",
    "settings": "تنظیمات",
    "payment_gateways": "درگاه‌های پرداخت",
}

ACTION_LABELS: dict[str, str] = {
    "view": "نمایش",
    "create": "افزودن",
    "update": "ویرایش",
    "delete": "حذف",
    "publish": "انتشار",
}

# resource -> the actions that make sense for it
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

ALL_PERMISSIONS: frozenset[tuple[str, str]] = frozenset(
    (resource, action) for resource, actions in RESOURCE_ACTIONS.items() for action in actions
)

APPLICANT_ROLE = "applicant"
SUPER_ADMIN_ROLE = "super_admin"
EMPLOYEE_ROLE = "employee"

# Roles that may enter the admin panel. ``admin`` is accepted for accounts created by
# the previous prototype so an existing deployment keeps working after the upgrade.
ADMIN_ROLE_CODES = frozenset({SUPER_ADMIN_ROLE, "admin", EMPLOYEE_ROLE})

_EMPLOYEE_GRANTS: tuple[tuple[str, str], ...] = (
    ("admin_panel", "view"),
    ("employees", "view"),
    ("roles", "view"),
    # Employees author the forms and processes applicants are guided through.
    ("forms", "view"),
    ("forms", "create"),
    ("forms", "update"),
    ("forms", "delete"),
    ("forms", "publish"),
    ("processes", "view"),
    ("processes", "create"),
    ("processes", "update"),
    ("processes", "delete"),
    ("requests", "view"),
    ("requests", "update"),
    ("requests", "delete"),
    ("calendar", "view"),
    ("calendar", "create"),
    ("calendar", "update"),
    ("messages", "view"),
    ("messages", "create"),
    ("reports", "view"),
    ("settings", "view"),
    ("payment_gateways", "view"),
)

#: Seed data for a fresh database. ``grants`` is a tuple of ``(resource, action)`` pairs.
DEFAULT_ROLES: tuple[dict[str, Any], ...] = (
    {
        "id": "role-super-admin",
        "code": SUPER_ADMIN_ROLE,
        "name": "مدیر کل سامانه",
        "description": "دسترسی کامل به همه بخش‌های پنل مدیریت.",
        "is_system": True,
        "grants": tuple(sorted(ALL_PERMISSIONS)),
    },
    {
        "id": "role-employee",
        "code": EMPLOYEE_ROLE,
        "name": "کارشناس",
        "description": "دسترسی به کارتابل، فرم‌ها و بررسی درخواست‌ها.",
        "is_system": True,
        "grants": _EMPLOYEE_GRANTS,
    },
    {
        "id": "role-applicant",
        "code": APPLICANT_ROLE,
        "name": "مراجع",
        "description": "دسترسی به میز خدمت و پیگیری درخواست‌های شخصی.",
        "is_system": True,
        "grants": (),
    },
)


def catalog() -> list[dict[str, Any]]:
    """Return the permission catalog in the shape the admin UI expects."""
    return [
        {
            "resource": resource,
            "label": label,
            "actions": [
                {"action": action, "label": ACTION_LABELS[action]} for action in RESOURCE_ACTIONS[resource]
            ],
        }
        for resource, label in RESOURCE_LABELS.items()
    ]


def action_labels() -> list[dict[str, str]]:
    used = {action for actions in RESOURCE_ACTIONS.values() for action in actions}
    return [{"action": action, "label": label} for action, label in ACTION_LABELS.items() if action in used]


def empty_matrix() -> dict[str, dict[str, bool]]:
    """A full matrix with every permission switched off (used by the UI)."""
    return {
        resource: {action: False for action in actions}
        for resource, actions in RESOURCE_ACTIONS.items()
    }


def matrix_from_pairs(pairs: Iterable[tuple[str, str]]) -> dict[str, dict[str, bool]]:
    matrix = empty_matrix()
    for resource, action in pairs:
        if resource in matrix and action in matrix[resource]:
            matrix[resource][action] = True
    return matrix


def pairs_from_matrix(matrix: dict[str, dict[str, Any]]) -> list[tuple[str, str]]:
    """Validate a client supplied matrix and flatten it into database rows."""
    pairs: list[tuple[str, str]] = []
    for resource, actions in (matrix or {}).items():
        if resource not in RESOURCE_ACTIONS:
            continue
        for action, enabled in (actions or {}).items():
            if enabled and (resource, action) in ALL_PERMISSIONS:
                pairs.append((resource, action))
    return sorted(set(pairs))


def has_permission(matrix: dict[str, dict[str, bool]], resource: str, action: str) -> bool:
    return bool(matrix.get(resource, {}).get(action))


def is_admin_role(code: str | None) -> bool:
    return (code or "") in ADMIN_ROLE_CODES


def default_role_grants(code: str) -> tuple[tuple[str, str], ...]:
    for role in DEFAULT_ROLES:
        if role["code"] == code:
            return tuple(role["grants"])
    return ()
