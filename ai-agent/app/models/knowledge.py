from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.core.database import Base

from .base import new_id, utcnow


class KnowledgeDocument(Base):
    """A retrievable chunk of organisational knowledge.

    ``checksum`` makes re-indexing idempotent: unchanged chunks keep their embedding
    instead of being re-embedded on every boot.
    """

    __tablename__ = "knowledge_documents"
    __table_args__ = (UniqueConstraint("source", "chunk_index", name="uq_knowledge_documents_source_chunk"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("kd"))
    title: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.EMBEDDING_DIM), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
