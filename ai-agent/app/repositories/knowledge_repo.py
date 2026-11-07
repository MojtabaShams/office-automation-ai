from __future__ import annotations

from sqlalchemy import case, delete, desc, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeDocument


def count(db: Session) -> int:
    return int(db.scalar(select(func.count()).select_from(KnowledgeDocument)) or 0)


def existing_checksums(db: Session) -> dict[tuple[str, int], str]:
    rows = db.execute(select(KnowledgeDocument.source, KnowledgeDocument.chunk_index, KnowledgeDocument.checksum))
    return {(source, index): checksum for source, index, checksum in rows}


def sources(db: Session) -> set[str]:
    return set(db.scalars(select(KnowledgeDocument.source).distinct()))


def upsert_chunks(db: Session, rows: list[dict]) -> int:
    """Bulk upsert chunks; unchanged checksums keep their existing embedding."""
    if not rows:
        return 0
    stmt = pg_insert(KnowledgeDocument).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_knowledge_documents_source_chunk",
        set_={
            "title": stmt.excluded.title,
            "content": stmt.excluded.content,
            "checksum": stmt.excluded.checksum,
            "embedding": stmt.excluded.embedding,
        },
        where=KnowledgeDocument.checksum != stmt.excluded.checksum,
    )
    result = db.execute(stmt)
    db.commit()
    return int(result.rowcount or 0)


def delete_source(db: Session, source: str) -> int:
    result = db.execute(delete(KnowledgeDocument).where(KnowledgeDocument.source == source))
    db.commit()
    return int(result.rowcount or 0)


def delete_stale_chunks(db: Session, source: str, keep_indexes: set[int]) -> int:
    stmt = delete(KnowledgeDocument).where(KnowledgeDocument.source == source)
    if keep_indexes:
        stmt = stmt.where(KnowledgeDocument.chunk_index.not_in(keep_indexes))
    result = db.execute(stmt)
    db.commit()
    return int(result.rowcount or 0)


def delete_missing_sources(db: Session, keep_sources: set[str]) -> int:
    stmt = delete(KnowledgeDocument)
    if keep_sources:
        stmt = stmt.where(KnowledgeDocument.source.not_in(keep_sources))
    result = db.execute(stmt)
    db.commit()
    return int(result.rowcount or 0)


def vector_search(
    db: Session, embedding: list[float], *, limit: int
) -> list[tuple[KnowledgeDocument, float]]:
    """Cosine similarity search through pgvector."""
    distance = KnowledgeDocument.embedding.cosine_distance(embedding).label("distance")
    stmt = (
        select(KnowledgeDocument, distance)
        .where(KnowledgeDocument.embedding.is_not(None))
        .order_by(distance)
        .limit(limit)
    )
    return [(doc, 1.0 - float(dist)) for doc, dist in db.execute(stmt).all()]


def lexical_search(
    db: Session, terms: list[str], *, limit: int
) -> list[tuple[KnowledgeDocument, float]]:
    """Fallback keyword search; complements the vector index for rare tokens."""
    cleaned = [term for term in {t.strip() for t in terms} if len(term) > 2][:8]
    if not cleaned:
        return []
    conditions = [KnowledgeDocument.content.ilike(f"%{term}%") for term in cleaned]
    score = func.sum(case(*[(condition, 1) for condition in conditions], else_=0)).label("score")
    stmt = (
        select(KnowledgeDocument, score)
        .where(or_(*conditions))
        .group_by(KnowledgeDocument.id)
        .order_by(desc(score))
        .limit(limit)
    )
    return [(doc, float(raw_score) / len(cleaned)) for doc, raw_score in db.execute(stmt).all()]


def list_all(db: Session, *, limit: int = 500) -> list[KnowledgeDocument]:
    return list(db.scalars(select(KnowledgeDocument).order_by(KnowledgeDocument.id).limit(limit)))
