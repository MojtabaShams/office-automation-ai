"""Alembic runtime configuration.

The URL always comes from :mod:`app.core.config` so that container environments, ``.env``
files and CI all share one source of truth.
"""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core.config import settings  # noqa: E402
from app.core.database import Base  # noqa: E402
from app import models  # noqa: F401,E402  (import side effect: register metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ``%`` is the configparser interpolation character; passwords often contain it.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))

target_metadata = Base.metadata


def _include_object(object_, name, type_, reflected, compare_to) -> bool:
    # ``alembic_version`` and pgvector helper objects are managed outside the app schema.
    if type_ == "table" and name == "alembic_version":
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        compare_server_default=True,
        include_object=_include_object,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_object=_include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
