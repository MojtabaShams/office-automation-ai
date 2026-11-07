"""Backend seam for the harness.

``deepagents`` ships one backend module per store (state, filesystem, sandbox, store...)
plus a composite that routes between them. This harness has a single store — the
organisation's PostgreSQL database reached through the session the runner injects — so
the seam is one protocol with one implementation. A composite is only worth adding when
a second backend actually exists; inventing one now would be an empty abstraction.
"""

from .db import DbBackend, session_for
from .protocol import RuntimeBackend

__all__ = ["DbBackend", "RuntimeBackend", "session_for"]
