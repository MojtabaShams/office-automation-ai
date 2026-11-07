"""Router registry: import once, include in ``app.main``."""

from __future__ import annotations

from fastapi import APIRouter

from . import (
    admin,
    auth,
    chat,
    form_documents,
    form_extraction,
    forms,
    health,
    knowledge,
    payment_gateways,
    processes,
    reports,
    roles,
    submissions,
    users,
)

ROUTERS: tuple[APIRouter, ...] = (
    health.router,
    auth.router,
    chat.router,
    form_documents.router,
    form_extraction.router,
    forms.router,
    submissions.router,
    knowledge.router,
    users.router,
    roles.router,
    payment_gateways.router,
    processes.router,
    reports.router,
    admin.router,
)

__all__ = [
    "ROUTERS",
    "admin",
    "auth",
    "chat",
    "form_extraction",
    "form_documents",
    "forms",
    "health",
    "knowledge",
    "payment_gateways",
    "processes",
    "reports",
    "roles",
    "submissions",
    "users",
]
