"""Database engine, session factory and schema bootstrap helpers."""

from __future__ import annotations

import logging
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import MetaData, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import BASE_DIR, settings

logger = logging.getLogger(__name__)

APP_TABLES = (
    "process_cases",
    "process_versions",
    "process_definitions",
    "form_documents",
    "submission_events",
    "chat_messages",
    "form_fields",
    "field_guidelines",
    "sessions",
    "submissions",
    "chat_sessions",
    "knowledge_documents",
    "forms",
    "payment_gateways",
    "role_permissions",
    "roles",
    "users",
    "alembic_version",
)


class SchemaDriftError(RuntimeError):
    """The database was created by a different (pre-Alembic) version of the models."""

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    future=True,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Context manager for background jobs (seeding, indexing, CLI helpers)."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ensure_pgvector() -> None:
    """Create the pgvector extension. Requires a superuser or a pre-provisioned DB."""
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


def _alembic_config():
    """Build an Alembic config pointing at this project's migration scripts."""
    from alembic.config import Config

    config = Config(str(BASE_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BASE_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))
    return config


def run_migrations() -> None:
    """Apply Alembic migrations programmatically (used on container start)."""
    from alembic import command

    command.upgrade(_alembic_config(), "head")


def _missing_schema_parts(inspector) -> list[str]:
    """Return tables/columns present in the models but absent from the database."""
    from app import models  # noqa: F401  (ensure metadata is populated)

    missing: list[str] = []
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            missing.append(table.name)
            continue
        existing = {column["name"] for column in inspector.get_columns(table.name)}
        missing.extend(f"{table.name}.{column.name}" for column in table.columns if column.name not in existing)
    return missing


def adopt_legacy_schema() -> bool:
    """Adopt a database whose tables were created by ``Base.metadata.create_all``.

    Early versions of the project created tables directly. Without a baseline Alembic
    would try to ``CREATE TABLE`` again and fail, so when the schema exists but the
    version table does not we align it with the metadata and stamp it as ``head``.

    If the existing schema drifted (a prototype built from older models), we refuse to
    stamp and raise :class:`SchemaDriftError` with the missing objects so the operator can
    decide between ``python -m app.cli reset-db`` and a hand-written migration.
    """
    from sqlalchemy import inspect

    inspector = inspect(engine)
    if inspector.has_table("alembic_version") or not inspector.has_table("users"):
        return False

    missing = _missing_schema_parts(inspector)
    if missing:
        raise SchemaDriftError(
            "The database schema predates this version of the models (missing: "
            + ", ".join(missing[:8])
            + "). For a development database run `python -m app.cli reset-db --yes`; "
            "for real data write a forward migration instead."
        )

    from alembic import command

    Base.metadata.create_all(bind=engine, checkfirst=True)
    command.stamp(_alembic_config(), "head")
    logger.warning("Legacy schema detected: stamped the current Alembic revision as baseline")
    return True


def init_db() -> None:
    """Prepare the database: extension, then Alembic migrations.

    ``AUTO_RUN_MIGRATIONS`` keeps local onboarding frictionless; in production you may
    prefer running ``alembic upgrade head`` in the deployment pipeline instead.
    """
    ensure_pgvector()
    if settings.AUTO_RUN_MIGRATIONS:
        adopt_legacy_schema()
        run_migrations()
    else:
        # Import models so that metadata is populated before create_all.
        from app import models  # noqa: F401

        Base.metadata.create_all(bind=engine)


def check_database() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # pragma: no cover - depends on runtime environment
        logger.exception("Database health check failed")
        return False
