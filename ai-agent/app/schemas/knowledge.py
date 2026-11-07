"""Knowledge base (RAG) payloads."""

from __future__ import annotations

from pydantic import AliasChoices, Field

from .common import APIModel


class KnowledgeSearchRequest(APIModel):
    query: str = Field(min_length=2, max_length=1000)
    k: int = Field(default=5, ge=1, le=20)


class KnowledgeImportRequest(APIModel):
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=10, max_length=200_000)
    source: str | None = Field(
        default=None,
        max_length=200,
        validation_alias=AliasChoices("source", "filename"),
    )
