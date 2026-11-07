"""FastAPI application factory.

Startup order:
1. configure logging;
2. ensure the ``vector`` extension and apply Alembic migrations;
3. seed roles, forms, knowledge and the bootstrap admin (idempotent).

The app still boots when the database is unreachable so that ``/api/health`` can report the
problem instead of the container crash-looping; data endpoints then return a clear error.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ROUTERS
from app.core.config import settings
from app.core.database import init_db
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info("Starting %s v%s (%s)", settings.APP_NAME, settings.APP_VERSION, settings.ENVIRONMENT)

    app.state.database_ready = False
    try:
        init_db()
        app.state.database_ready = True
    except Exception:
        logger.exception("Database initialisation failed; API will report an unhealthy state")

    if app.state.database_ready and settings.SEED_ON_STARTUP:
        try:
            from app.services.bootstrap import bootstrap_on_startup

            summary = bootstrap_on_startup()
            logger.info(
                "Bootstrap finished (roles=%s, forms=%s, knowledge_chunks=%s, admin=%s, errors=%s)",
                summary.get("roles"),
                (summary.get("forms") or {}).get("updated"),
                (summary.get("knowledge") or {}).get("chunks"),
                summary.get("admin"),
                summary.get("errors") or "none",
            )
        except Exception:  # seeding is best-effort
            logger.exception("Startup bootstrap failed")

    if not settings.llm_enabled:
        logger.warning("No LLM API key is set: the agent will use deterministic fallbacks")

    yield

    logger.info("Shutting down %s", settings.APP_NAME)


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{settings.APP_NAME} API",
        version=settings.APP_VERSION,
        description=(
            "میز خدمت هوشمند: مشاوره، تعریف پویای فرم و ثبت درخواست با Agent مبتنی بر LangGraph."
        ),
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    register_exception_handlers(app)

    for router in ROUTERS:
        app.include_router(router)

    @app.get("/", tags=["health"])
    def root() -> dict:
        return {
            "status": "ok",
            "message": "سرویس میز خدمت هوشمند در حال اجراست.",
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "docs": "/docs",
        }

    return app


app = create_app()
