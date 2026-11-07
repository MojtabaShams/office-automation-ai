"""Startup seeding.

The service desk must be useful right after ``docker compose up``: the default roles are
seeded, form definitions are imported from ``forms/*.json``, the knowledge folder is chunked
and embedded, and the bootstrap admin account is created. Every step is idempotent and
failure-tolerant so that a missing optional dependency (e.g. an embedding provider) never
blocks startup.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from . import auth_service, form_service, knowledge_service, role_service

logger = logging.getLogger(__name__)


def run_bootstrap(db: Session) -> dict:
    summary: dict = {"roles": None, "forms": None, "knowledge": None, "admin": None, "errors": []}

    try:
        roles = role_service.ensure_default_roles(db)
        summary["roles"] = [role.code for role in roles]
        logger.info("Roles seeded: %s", summary["roles"])
    except Exception as exc:  # a broken seed must not stop the API
        summary["errors"].append(f"roles: {exc}")
        logger.exception("Role seeding failed")

    try:
        summary["forms"] = form_service.sync_forms_from_disk(db)
        summary["field_guidelines"] = form_service.sync_field_guidelines(db)
        logger.info("Forms synced: %s", summary["forms"])
    except Exception as exc:  # a broken form file must not stop the API
        summary["errors"].append(f"forms: {exc}")
        logger.exception("Form synchronisation failed")

    try:
        summary["knowledge"] = knowledge_service.sync_knowledge(db)
        logger.info("Knowledge synced: %s", summary["knowledge"])
    except Exception as exc:
        summary["errors"].append(f"knowledge: {exc}")
        logger.exception("Knowledge synchronisation failed")

    try:
        admin = auth_service.ensure_admin(db)
        summary["admin"] = admin.mobile if admin else None
    except Exception as exc:
        summary["errors"].append(f"admin: {exc}")
        logger.exception("Admin bootstrap failed")

    return summary


def bootstrap_on_startup() -> dict:
    """Open a short-lived session and run the seeding steps."""
    from app.core.database import session_scope

    with session_scope() as db:
        return run_bootstrap(db)
