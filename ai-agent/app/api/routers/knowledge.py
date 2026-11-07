"""Knowledge base (RAG) endpoints: semantic search, ingestion and indexing."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_admin, require_user
from app.models.user import User
from app.schemas.common import ok
from app.schemas.knowledge import KnowledgeImportRequest, KnowledgeSearchRequest
from app.services import knowledge_service

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("/search")
def search_knowledge(
    req: KnowledgeSearchRequest,
    _: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    chunks = knowledge_service.search(db, req.query, req.k)
    return ok(
        "نتایج جستجو",
        query=req.query,
        results=[chunk.as_citation() for chunk in chunks],
        count=len(chunks),
    )


@router.get("/stats")
def knowledge_stats(
    _: User = Depends(require_admin),
    db: Session = Depends(db_session),
) -> dict:
    return ok("وضعیت پایگاه دانش", **knowledge_service.stats(db))


@router.post("/sync")
def sync_knowledge(
    _: User = Depends(require_admin),
    db: Session = Depends(db_session),
) -> dict:
    summary = knowledge_service.sync_knowledge(db)
    return ok("همگام‌سازی پایگاه دانش انجام شد.", **summary)


@router.post("/import")
def import_knowledge(
    req: KnowledgeImportRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(db_session),
) -> dict:
    chunks = knowledge_service.import_text(db, title=req.title, content=req.content, source=req.source)
    return ok("سند به پایگاه دانش افزوده شد.", chunks=chunks, title=req.title)
