"""Knowledge ingestion and retrieval."""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.knowledge import RetrievedChunk, chunk_text, embed_texts, format_context, hybrid_search
from app.repositories import knowledge_repo

logger = logging.getLogger(__name__)

_EMBED_BATCH = 32


def _document_title(path: Path, text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip().lstrip("#").strip()
        if stripped:
            return stripped[:200]
    return path.stem


def _checksum(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def sync_knowledge(
    db: Session, *, knowledge_dir: Path | None = None, force: bool = False
) -> dict:
    """Index ``knowledge/*.txt|md`` into pgvector, skipping unchanged chunks."""
    knowledge_dir = knowledge_dir or settings.KNOWLEDGE_DIR
    summary = {"sources": 0, "chunks": 0, "embedded": 0, "unchanged": 0, "failed": 0, "errors": []}
    if not knowledge_dir.exists():
        return summary

    existing = {} if force else knowledge_repo.existing_checksums(db)
    indexed_sources: set[str] = set()

    for path in sorted(list(knowledge_dir.glob("*.txt")) + list(knowledge_dir.glob("*.md"))):
        try:
            text = path.read_text(encoding="utf-8")
        except Exception as exc:
            summary["failed"] += 1
            summary["errors"].append(f"{path.name}: {exc}")
            continue

        source = path.name
        indexed_sources.add(source)
        title = _document_title(path, text)
        chunks = chunk_text(text) or [text.strip()]
        summary["sources"] += 1
        summary["chunks"] += len(chunks)

        pending_rows: list[dict] = []
        embed_indexes: list[int] = []
        embed_texts_batch: list[str] = []

        for index, chunk in enumerate(chunks):
            checksum = _checksum(chunk)
            row = {
                "title": title,
                "source": source,
                "content": chunk,
                "chunk_index": index,
                "checksum": checksum,
                "embedding": None,
            }
            pending_rows.append(row)
            if existing.get((source, index)) != checksum or force:
                embed_indexes.append(len(pending_rows) - 1)
                embed_texts_batch.append(f"{title}\n{chunk}")

        for start in range(0, len(embed_texts_batch), _EMBED_BATCH):
            batch = embed_texts_batch[start : start + _EMBED_BATCH]
            batch_indexes = embed_indexes[start : start + _EMBED_BATCH]
            try:
                vectors = embed_texts(batch)
            except Exception as exc:  # embedding outage: index text, search lexically
                logger.warning("Embedding failed for %s: %s", source, exc)
                summary["errors"].append(f"{source}: embedding failed ({exc})")
                continue
            for position, vector in zip(batch_indexes, vectors):
                pending_rows[position]["embedding"] = vector
                summary["embedded"] += 1

        summary["unchanged"] += len(pending_rows) - len(embed_indexes)
        knowledge_repo.upsert_chunks(db, pending_rows)
        knowledge_repo.delete_stale_chunks(db, source, set(range(len(chunks))))

    removed = knowledge_repo.delete_missing_sources(db, indexed_sources)
    summary["removed"] = removed
    return summary


def search(db: Session, query: str, k: int | None = None) -> list[RetrievedChunk]:
    return hybrid_search(db, query, top_k=k)


def search_context(db: Session, query: str) -> tuple[str, list[dict], list[RetrievedChunk]]:
    chunks = search(db, query)
    return format_context(chunks), [chunk.as_citation() for chunk in chunks], chunks


def stats(db: Session) -> dict:
    return {
        "documents": knowledge_repo.count(db),
        "sources": sorted(knowledge_repo.sources(db)),
        "provider": settings.EMBEDDING_PROVIDER,
        "dimensions": settings.EMBEDDING_DIM,
    }


def import_text(db: Session, *, title: str, content: str, source: str | None = None) -> int:
    """Add a single document (used by the admin API)."""
    source = (source or re.sub(r"[^\w.-]+", "_", title)).strip() or "manual"
    chunks = chunk_text(content) or [content]
    embeddings = embed_texts([f"{title}\n{chunk}" for chunk in chunks])
    rows = [
        {
            "title": title,
            "source": source,
            "content": chunk,
            "chunk_index": index,
            "checksum": _checksum(chunk),
            "embedding": embeddings[index] if index < len(embeddings) else None,
        }
        for index, chunk in enumerate(chunks)
    ]
    knowledge_repo.upsert_chunks(db, rows)
    knowledge_repo.delete_stale_chunks(db, source, set(range(len(chunks))))
    return len(rows)
