"""Text chunking for the knowledge index."""

from __future__ import annotations

import re

from app.core.config import settings

_HEADING_RE = re.compile(r"^(#{1,6}\s+|\s*[0-9]+[.)]\s+|\s*[-*]\s+)")


def _split_paragraphs(text: str) -> list[str]:
    paragraphs = [block.strip() for block in re.split(r"\n\s*\n", text) if block.strip()]
    return paragraphs or ([text.strip()] if text.strip() else [])


def chunk_text(
    text: str,
    *,
    max_chars: int | None = None,
    overlap: int | None = None,
) -> list[str]:
    """Split text on paragraph boundaries with a character budget and overlap.

    Overlap preserves context that would otherwise be cut in half at a boundary, which
    matters for rules that continue across paragraphs.
    """
    max_chars = max_chars or settings.KNOWLEDGE_CHUNK_SIZE
    overlap = min(overlap if overlap is not None else settings.KNOWLEDGE_CHUNK_OVERLAP, max_chars // 2)

    chunks: list[str] = []
    buffer = ""

    def flush() -> None:
        nonlocal buffer
        if buffer.strip():
            chunks.append(buffer.strip())
        buffer = ""

    for paragraph in _split_paragraphs(text):
        if len(paragraph) > max_chars:
            flush()
            start = 0
            while start < len(paragraph):
                end = start + max_chars
                chunks.append(paragraph[start:end].strip())
                start = max(end - overlap, start + 1)
            continue

        candidate = f"{buffer}\n\n{paragraph}" if buffer else paragraph
        if len(candidate) <= max_chars:
            buffer = candidate
            continue

        flush()
        buffer = paragraph

    flush()

    if overlap and len(chunks) > 1:
        chunks = _apply_overlap(chunks, overlap)
    return [chunk for chunk in chunks if chunk]


def _apply_overlap(chunks: list[str], overlap: int) -> list[str]:
    """Prepend the tail of the previous chunk to each chunk (bounded by ``overlap``)."""
    result = [chunks[0]]
    for previous, current in zip(chunks, chunks[1:]):
        tail = previous[-overlap:] if len(previous) > overlap else previous
        if previous.strip().endswith(current.strip()[:20]):
            result.append(current)
        else:
            result.append(f"{tail}\n\n{current}")
    return result


def is_heading(line: str) -> bool:
    return bool(_HEADING_RE.match(line))
