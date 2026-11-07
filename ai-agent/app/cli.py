"""Operations CLI.

Usage::

    python -m app.cli init                      # migrate + seed
    python -m app.cli seed                      # seed forms/knowledge/admin only
    python -m app.cli create-admin --mobile 09121234567 --password "Secret#123"
    python -m app.cli sync-forms
    python -m app.cli sync-knowledge [--force]
    python -m app.cli search "شرایط مرخصی استعلاجی"
    python -m app.cli reset-db --yes            # DESTRUCTIVE: wipe and migrate

The CLI reuses exactly the same services as the API, so behaviour stays consistent.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from sqlalchemy import text

from app.core.config import settings
from app.core.database import (
    APP_TABLES,
    ensure_pgvector,
    init_db,
    run_migrations,
    session_scope,
)
from app.core.logging import configure_logging


def _dump(payload) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


def cmd_init(_: argparse.Namespace) -> int:
    init_db()
    print("schema is up to date")
    return cmd_seed(_)


def cmd_seed(_: argparse.Namespace) -> int:
    from app.services.bootstrap import bootstrap_on_startup

    _dump(bootstrap_on_startup())
    return 0


def cmd_create_admin(args: argparse.Namespace) -> int:
    from app.services import auth_service

    with session_scope() as db:
        user = auth_service.create_admin(
            db,
            mobile=args.mobile,
            password=args.password,
            full_name=args.name,
            national_id=args.national_id,
        )
        print(f"admin ready: {user.mobile} ({user.id})")
    return 0


def cmd_sync_forms(_: argparse.Namespace) -> int:
    from app.services import form_service

    with session_scope() as db:
        _dump(form_service.sync_forms_from_disk(db))
    return 0


def cmd_sync_knowledge(args: argparse.Namespace) -> int:
    from app.services import knowledge_service

    with session_scope() as db:
        _dump(knowledge_service.sync_knowledge(db, force=args.force))
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    from app.services import knowledge_service

    with session_scope() as db:
        _dump([chunk.as_citation() for chunk in knowledge_service.search(db, args.query, args.k)])
    return 0


def cmd_reset_db(args: argparse.Namespace) -> int:
    if not args.yes:
        print(
            "This drops every application table (users, forms, submissions, chat, knowledge).\n"
            "Re-run with --yes once you are sure.",
            file=sys.stderr,
        )
        return 2

    from app.core.database import engine

    # CASCADE removes dependent rows/indexes; APP_TABLES covers every historical name.
    with engine.begin() as conn:
        for table in APP_TABLES:
            conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))

    ensure_pgvector()
    run_migrations()
    print("database reset and migrated to head")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="app.cli", description="Office Automation AI operator CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="apply migrations and seed content").set_defaults(func=cmd_init)
    sub.add_parser("seed", help="sync forms/knowledge and ensure the admin").set_defaults(func=cmd_seed)

    admin = sub.add_parser("create-admin", help="create or promote an administrator")
    admin.add_argument("--mobile", required=True)
    admin.add_argument("--password", required=True)
    admin.add_argument("--name", default=settings.ADMIN_FULL_NAME)
    admin.add_argument("--national-id", dest="national_id", default=None)
    admin.set_defaults(func=cmd_create_admin)

    sub.add_parser("sync-forms", help="re-import forms/*.json").set_defaults(func=cmd_sync_forms)

    knowledge = sub.add_parser("sync-knowledge", help="re-index knowledge/*.txt|md")
    knowledge.add_argument("--force", action="store_true", help="re-embed every chunk")
    knowledge.set_defaults(func=cmd_sync_knowledge)

    search = sub.add_parser("search", help="query the knowledge base")
    search.add_argument("query")
    search.add_argument("-k", type=int, default=settings.KNOWLEDGE_TOP_K)
    search.set_defaults(func=cmd_search)

    reset = sub.add_parser("reset-db", help="DESTRUCTIVE: drop all tables and migrate")
    reset.add_argument("--yes", action="store_true")
    reset.set_defaults(func=cmd_reset_db)

    return parser


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    logging.getLogger("alembic").setLevel(logging.WARNING)
    args = build_parser().parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
