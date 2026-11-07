"""Optional public web search for the advisor.

Official process data always comes from PostgreSQL; the web is only consulted for
general public context (holidays, national regulations, opening hours…) and the caller
must label it as such. Two providers are supported:

* **Tavily** when ``TAVILY_API_KEY`` is configured (structured JSON, best quality),
* **DuckDuckGo HTML** otherwise (no key, no extra dependency, best effort).

The feature is off by default (``WEB_SEARCH_ENABLED=false``) so offline environments and
test runs never wait on a network round-trip.
"""

from __future__ import annotations

import html
import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_DDG_URL = "https://html.duckduckgo.com/html/"
_TAVILY_URL = "https://api.tavily.com/search"
_RESULT_RE = re.compile(
    r'<a[^>]+class="result__a"[^>]+href="(?P<url>[^"]+)"[^>]*>(?P<title>.*?)</a>'
    r'.*?<a[^>]+class="result__snippet"[^>]*>(?P<snippet>.*?)</a>',
    re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")


def enabled() -> bool:
    return bool(settings.WEB_SEARCH_ENABLED)


def _clean(raw: str) -> str:
    return " ".join(html.unescape(_TAG_RE.sub(" ", raw or "")).split())


def _duckduckgo(query: str, limit: int) -> list[dict]:
    response = httpx.post(
        _DDG_URL,
        data={"q": query},
        headers={"User-Agent": "Mozilla/5.0 (compatible; ServiceDeskBot/1.0)"},
        timeout=settings.WEB_SEARCH_TIMEOUT_SECONDS,
        follow_redirects=True,
    )
    response.raise_for_status()
    results: list[dict] = []
    for match in _RESULT_RE.finditer(response.text):
        url = html.unescape(match.group("url"))
        if "duckduckgo.com/y.js" in url:  # sponsored slot
            continue
        results.append(
            {
                "title": _clean(match.group("title")),
                "url": url,
                "snippet": _clean(match.group("snippet")),
            }
        )
        if len(results) >= limit:
            break
    return results


def _tavily(query: str, limit: int) -> list[dict]:
    response = httpx.post(
        _TAVILY_URL,
        json={
            "api_key": settings.TAVILY_API_KEY,
            "query": query,
            "max_results": limit,
            "search_depth": "basic",
            "include_answer": False,
        },
        timeout=settings.WEB_SEARCH_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    return [
        {
            "title": str(item.get("title") or "").strip(),
            "url": str(item.get("url") or "").strip(),
            "snippet": str(item.get("content") or "").strip()[:400],
        }
        for item in (payload.get("results") or [])[:limit]
        if item.get("url")
    ]


def search(query: str, *, limit: int | None = None) -> list[dict]:
    """Public web results for ``query``; any failure degrades to an empty list."""
    query = (query or "").strip()
    if not enabled() or len(query) < 3:
        return []
    count = limit or settings.WEB_SEARCH_MAX_RESULTS
    try:
        if settings.TAVILY_API_KEY.strip():
            return _tavily(query, count)
        return _duckduckgo(query, count)
    except Exception as exc:  # network/parse problems must never break a chat turn
        logger.warning("Web search failed: %s", exc)
        return []


def search_text(query: str, *, limit: int | None = None) -> str:
    """Compact block for prompts; explicitly marked as *not* official process data."""
    if not enabled():
        return ""
    results = search(query, limit=limit)
    if not results:
        return ""
    lines = ["[اطلاعات عمومی از وب — منبع رسمی سازمان نیست]"]
    for index, item in enumerate(results, start=1):
        snippet = item.get("snippet") or ""
        lines.append(f"{index}. {item.get('title') or item.get('url')} — {snippet}")
    return "\n".join(lines)
