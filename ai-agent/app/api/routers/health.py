"""Liveness and readiness probes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import check_database
from app.core.dependencies import db_session
from app.schemas.common import ok
from app.repositories import form_repo, knowledge_repo

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict:
    """Cheap liveness probe: no database round-trip beyond a ``SELECT 1``."""
    return ok(
        "سرویس در حال اجراست.",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        database=check_database(),
        llm=settings.llm_enabled,
        embedding=settings.EMBEDDING_PROVIDER,
    )


@router.get("/health/ready")
def readiness(db: Session = Depends(db_session)) -> dict:
    """Readiness probe reporting how much content has been indexed."""
    return ok(
        "سرویس آماده سرویس‌دهی است.",
        database=check_database(),
        forms=form_repo.count_forms(db),
        knowledge_chunks=knowledge_repo.count(db),
        embedding=settings.EMBEDDING_PROVIDER,
    )


@router.get("/meta")
def metadata() -> dict:
    """Public metadata used by the client to render the empty state."""
    return ok(
        "اطلاعات سامانه",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        llm=settings.llm_enabled,
    )
