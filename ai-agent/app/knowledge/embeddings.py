"""Embedding backends.

Two providers are supported:

* ``hashing`` (default) – a deterministic, dependency-free hashing vectoriser. It works
  fully offline and gives usable lexical similarity (including Persian morphology
  normalisation), which is enough for a small knowledge base.
* ``openai`` – any OpenAI-compatible ``/embeddings`` endpoint for real semantic search.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
import unicodedata
from collections.abc import Sequence
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_ARABIC_TO_PERSIAN = str.maketrans({"ي": "ی", "ك": "ک", "ۀ": "ه", "ة": "ه", "أ": "ا", "إ": "ا", "آ": "ا"})
_DIACRITICS = re.compile(r"[\u064B-\u0652\u0670\u0640]")
_TOKEN_RE = re.compile(r"[0-9A-Za-z\u0600-\u06FF]+")
_STOPWORDS = {
    "از", "به", "با", "که", "را", "در", "و", "یا", "این", "آن", "برای", "است", "هست",
    "می", "شود", "شد", "های", "ها", "یک", "تا", "بر", "هم", "کن", "کرد", "اگر",
}


class EmbeddingError(RuntimeError):
    pass


class Embedder(Protocol):
    dim: int

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.translate(_ARABIC_TO_PERSIAN)
    text = _DIACRITICS.sub("", text)
    text = text.replace("\u200c", " ")  # zero-width non-joiner
    return re.sub(r"\s+", " ", text).strip().lower()


def tokenize(text: str) -> list[str]:
    tokens = _TOKEN_RE.findall(normalize_text(text))
    return [token for token in tokens if token not in _STOPWORDS]


class HashingEmbedder:
    """Signed feature hashing over words and character trigrams."""

    def __init__(self, dim: int) -> None:
        self.dim = dim

    def _features(self, text: str) -> list[tuple[str, float]]:
        tokens = tokenize(text)
        features: list[tuple[str, float]] = []
        for token in tokens:
            features.append((token, 1.0))
            # Character trigrams make partial matches (e.g. "مرخصی" vs "مرخصی‌ها") collapse.
            if len(token) >= 4:
                for index in range(len(token) - 2):
                    features.append(("c:" + token[index : index + 3], 0.35))
        if len(tokens) > 1:
            for left, right in zip(tokens, tokens[1:]):
                features.append((f"b:{left}_{right}", 0.5))
        return features

    def _index(self, feature: str) -> tuple[int, float]:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        value = int.from_bytes(digest, "big")
        sign = 1.0 if value & 1 else -1.0
        return (value >> 1) % self.dim, sign

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            vector = [0.0] * self.dim
            counts: dict[str, int] = {}
            for feature, weight in self._features(text):
                counts[feature] = counts.get(feature, 0) + 1
                index, sign = self._index(feature)
                vector[index] += sign * weight
            # Sublinear term-frequency damping keeps long chunks comparable to short ones.
            if len(counts) > 1:
                vector = [value * (1.0 + math.log(1 + value)) if value > 0 else value for value in vector]
            norm = math.sqrt(sum(value * value for value in vector)) or 1.0
            vectors.append([round(value / norm, 6) for value in vector])
        return vectors


class OpenAIEmbedder:
    def __init__(self, *, dim: int, model: str, base_url: str, api_key: str, timeout: float = 30.0) -> None:
        self.dim = dim
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            response = httpx.post(
                f"{self.base_url}/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "input": list(texts), "dimensions": self.dim},
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:  # pragma: no cover - network dependent
            raise EmbeddingError(f"سرویس embedding پاسخ نداد: {exc}") from exc

        ordered = sorted(payload["data"], key=lambda item: item["index"])
        vectors = [item["embedding"] for item in ordered]
        if vectors and len(vectors[0]) != self.dim:
            raise EmbeddingError(
                f"بُعد بردار برگشتی ({len(vectors[0])}) با EMBEDDING_DIM ({self.dim}) هم‌خوان نیست."
            )
        return vectors


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    if settings.EMBEDDING_PROVIDER == "openai":
        if not settings.EMBEDDING_API_KEY:
            logger.warning("EMBEDDING_PROVIDER=openai ولی EMBEDDING_API_KEY خالی است؛ fallback به hashing.")
            return HashingEmbedder(settings.EMBEDDING_DIM)
        return OpenAIEmbedder(
            dim=settings.EMBEDDING_DIM,
            model=settings.EMBEDDING_MODEL,
            base_url=settings.EMBEDDING_API_BASE,
            api_key=settings.EMBEDDING_API_KEY,
        )
    return HashingEmbedder(settings.EMBEDDING_DIM)


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    return get_embedder().embed(texts)


def embed_query(text: str) -> list[float]:
    vectors = embed_texts([text])
    return vectors[0] if vectors else []
