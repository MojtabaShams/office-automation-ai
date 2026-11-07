"""Chat-model factories.

Two modes are supported, in this order of preference:

* **Ensemble (GapGPT)** - Gemini, ChatGPT and Claude are reached through GapGPT's
  OpenAI-compatible endpoint. :func:`get_chat_model` builds one client per model id;
  :mod:`app.agents.ensemble` fans the calls out in parallel.
* **Single model fallback (Groq)** - the historical behaviour, used by the summariser,
  the document extractor and the anonymous path when no GapGPT key is configured.

Every factory returns ``None`` when its key is missing or the SDK is not installed, so the
agent can always degrade to the deterministic replies in :mod:`app.agents.nodes`.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=16)
def get_chat_model(model: str, temperature: float | None = None):
    """Return a ``ChatOpenAI`` client pointed at GapGPT for ``model``, or ``None``."""
    if not settings.ensemble_enabled:
        return None
    try:
        from langchain_openai import ChatOpenAI
    except ImportError:  # pragma: no cover - dependency guard
        logger.warning("langchain-openai is not installed; GapGPT ensemble is disabled.")
        return None

    return ChatOpenAI(
        model=model,
        api_key=settings.GAPGPT_API_KEY,
        base_url=settings.GAPGPT_BASE_URL,
        temperature=settings.AGENT_ENSEMBLE_TEMPERATURE if temperature is None else temperature,
        max_tokens=settings.AGENT_ENSEMBLE_MAX_TOKENS,
        timeout=settings.AGENT_ENSEMBLE_TIMEOUT_SECONDS,
        # The ensemble already tolerates a failed member; one retry per call is enough.
        max_retries=1,
    )


@lru_cache(maxsize=1)
def get_llm():
    """Single-model client used outside the ensemble, or ``None`` without a configured key."""
    if settings.GROQ_API_KEY.strip():
        try:
            from langchain_groq import ChatGroq
        except ImportError:  # pragma: no cover - dependency guard
            logger.warning("langchain-groq is not installed; agent fallback mode is active.")
            return None

        kwargs = {
            "model": settings.GROQ_MODEL,
            "api_key": settings.GROQ_API_KEY,
            "temperature": settings.GROQ_TEMPERATURE,
            "max_tokens": settings.GROQ_MAX_TOKENS,
            "timeout": 30,
            "max_retries": 1,
        }
        try:
            return ChatGroq(base_url=settings.GROQ_BASE_URL, **kwargs)
        except TypeError:
            # Older/newer client versions may not expose ``base_url``; the default endpoint works.
            return ChatGroq(**kwargs)

    if settings.OPENAI_API_KEY.strip():
        try:
            from langchain_openai import ChatOpenAI
        except ImportError:  # pragma: no cover - dependency guard
            logger.warning("langchain-openai is not installed; agent fallback mode is active.")
            return None
        return ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            temperature=settings.GROQ_TEMPERATURE,
            max_tokens=settings.GROQ_MAX_TOKENS,
            timeout=30,
            max_retries=1,
        )

    logger.info("No single-model API key is configured; deterministic fallback is active.")
    return None


def llm_available() -> bool:
    """True when any LLM path (ensemble or single model) can answer a turn."""
    return settings.ensemble_enabled or get_llm() is not None


def reset_cache() -> None:
    """Drop cached clients so a settings change is picked up (used by tests)."""
    get_chat_model.cache_clear()
    get_llm.cache_clear()
