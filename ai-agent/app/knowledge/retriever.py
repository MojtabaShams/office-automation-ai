"""Hybrid retrieval (pgvector + lexical) with reciprocal-rank fusion."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories import knowledge_repo

from .embeddings import EmbeddingError, embed_query, tokenize

logger = logging.getLogger(__name__)

_RRF_K = 60


@dataclass(slots=True, frozen=True)
class RetrievedChunk:
    id: str
    title: str
    source: str
    content: str
    score: float
    chunk_index: int

    def as_citation(self) -> dict:
        return {"title": self.title, "source": self.source, "chunk": self.chunk_index, "score": round(self.score, 4)}


def hybrid_search(db: Session, query: str, *, top_k: int | None = None) -> list[RetrievedChunk]:
    """Retrieve the most relevant chunks, combining semantic and keyword signals."""
    query = (query or "").strip()
    if not query:
        return []

    top_k = top_k or settings.KNOWLEDGE_TOP_K
    candidates = max(top_k * 3, 10)

    vector_hits: list[tuple] = []
    try:
        query_vector = embed_query(query)
        if query_vector:
            vector_hits = knowledge_repo.vector_search(db, query_vector, limit=candidates)
    except EmbeddingError as exc:  # embedding outage must not break the chat
        logger.warning("Vector search unavailable, falling back to lexical only: %s", exc)

    lexical_hits = knowledge_repo.lexical_search(db, tokenize(query), limit=candidates)

    scores: dict[str, float] = {}
    documents: dict[str, object] = {}

    for rank, (document, similarity) in enumerate(vector_hits, start=1):
        if similarity < settings.KNOWLEDGE_MIN_SCORE:
            continue
        documents[document.id] = document
        scores[document.id] = scores.get(document.id, 0.0) + 1.0 / (_RRF_K + rank)

    for rank, (document, keyword_score) in enumerate(lexical_hits, start=1):
        if keyword_score <= 0:
            continue
        documents[document.id] = document
        scores[document.id] = scores.get(document.id, 0.0) + 0.6 / (_RRF_K + rank)

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:top_k]

    results: list[RetrievedChunk] = []
    seen_content: set[str] = set()
    for document_id, score in ranked:
        document = documents[document_id]
        fingerprint = (document.content or "")[:120]
        if fingerprint in seen_content:
            continue
        seen_content.add(fingerprint)
        results.append(
            RetrievedChunk(
                id=document.id,
                title=document.title,
                source=document.source,
                content=document.content,
                score=score,
                chunk_index=document.chunk_index,
            )
        )
    return results


def format_context(chunks: list[RetrievedChunk]) -> str:
    """Render retrieved chunks for the LLM prompt, numbered for citation."""
    if not chunks:
        return ""
    blocks = []
    for index, chunk in enumerate(chunks, start=1):
        blocks.append(f"[{index}] ({chunk.title})\n{chunk.content}")
    return "\n\n---\n\n".join(blocks)
