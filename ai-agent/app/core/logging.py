"""Minimal logging setup (stdout, level driven by settings)."""

from __future__ import annotations

import logging
import sys

from .config import settings


def configure_logging() -> None:
    level = logging.DEBUG if settings.DEBUG else logging.INFO
    root = logging.getLogger()
    if root.handlers:
        root.setLevel(level)
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"))
    root.addHandler(handler)
    root.setLevel(level)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
