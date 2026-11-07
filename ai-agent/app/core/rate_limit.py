"""In-process sliding-window rate limiting.

The deployment target is a single FastAPI container, so an in-memory limiter is
enough and keeps the stack dependency free. It is deliberately tiny: a sorted list of
hit timestamps per key, guarded by a lock. If the app is ever scaled horizontally the
same interface can be backed by Redis without touching the call sites.
"""

from __future__ import annotations

import math
import threading
import time

from .exceptions import RateLimitError


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = max(1, limit)
        self.window = max(1, window_seconds)
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> int:
        """Record a hit. Returns ``0`` when allowed, else the retry delay in seconds."""
        now = time.monotonic()
        with self._lock:
            bucket = [stamp for stamp in self._hits.get(key, ()) if now - stamp < self.window]
            if len(bucket) >= self.limit:
                self._hits[key] = bucket
                return max(1, math.ceil(self.window - (now - bucket[0])))
            bucket.append(now)
            self._hits[key] = bucket
            if len(self._hits) > 5_000:
                self._prune(now)
        return 0

    def _prune(self, now: float) -> None:
        for key in [k for k, stamps in self._hits.items() if not stamps or now - stamps[-1] >= self.window]:
            self._hits.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


_LIMITERS: dict[str, SlidingWindowLimiter] = {}
_LIMITERS_LOCK = threading.Lock()


def get_limiter(name: str, limit: int, window_seconds: int) -> SlidingWindowLimiter:
    with _LIMITERS_LOCK:
        limiter = _LIMITERS.get(name)
        if limiter is None or limiter.limit != limit or limiter.window != window_seconds:
            limiter = SlidingWindowLimiter(limit, window_seconds)
            _LIMITERS[name] = limiter
        return limiter


def enforce(name: str, key: str, *, limit: int, window_seconds: int, message: str | None = None) -> None:
    retry_after = get_limiter(name, limit, window_seconds).hit(key or "anonymous")
    if retry_after:
        raise RateLimitError(
            message
            or f"تعداد تلاش‌ها بیش از حد مجاز است. لطفاً {retry_after} ثانیه دیگر دوباره تلاش کنید.",
            retry_after=retry_after,
        )


def reset_all() -> None:
    """Clear every bucket (used by the test suite)."""
    with _LIMITERS_LOCK:
        for limiter in _LIMITERS.values():
            limiter.reset()
