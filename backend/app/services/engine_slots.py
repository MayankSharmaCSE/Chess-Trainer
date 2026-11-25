"""Process-wide cap on concurrently running Stockfish processes.

Every Stockfish 17 process holds ~250 MB (the NNUE network). On a 512 MB host
(Render free tier, ~85 MB for Python) two at once exceed the memory limit and
the container is OOM-killed, which takes the whole site down. So every place
that spawns the engine first takes a slot here.

- STOCKFISH_MAX_PROCESSES (default 1) sets the cap; raise it on bigger hosts.
- Game analyses also queue on `analysis_lock`, so they run one at a time and
  never compete with each other for the slot.
- A running analysis polls `contended()` between positions and briefly hands
  its slot to an interactive caller (bot move, drill grading) instead of
  making it wait for the whole game.
"""

from __future__ import annotations

import os
import threading
import time
from contextlib import contextmanager
from collections.abc import Iterator

MAX_PROCESSES = max(1, int(os.getenv("STOCKFISH_MAX_PROCESSES", "1")))
# How long an interactive caller waits for a slot before giving up.
SLOT_TIMEOUT_S = float(os.getenv("STOCKFISH_SLOT_TIMEOUT_S", "60"))


class EngineBusyError(RuntimeError):
    """No engine slot became free in time. Subclasses RuntimeError so existing
    engine-failure handlers (fallbacks, 503s) already cover it."""


class EngineSlots:
    def __init__(self, size: int) -> None:
        self._sem = threading.BoundedSemaphore(size)
        self._lock = threading.Lock()
        self._waiting = 0

    def acquire(self, timeout: float | None = SLOT_TIMEOUT_S) -> None:
        with self._lock:
            self._waiting += 1
        try:
            ok = self._sem.acquire(timeout=timeout) if timeout is not None else self._sem.acquire()
        finally:
            with self._lock:
                self._waiting -= 1
        if not ok:
            raise EngineBusyError("Stockfish is busy; please retry in a moment.")

    def release(self) -> None:
        self._sem.release()

    def contended(self) -> bool:
        """True while some caller is blocked waiting for a slot."""
        with self._lock:
            return self._waiting > 0

    def yield_to_waiters(self, max_wait_s: float = 5.0) -> None:
        """Hand a held slot to whoever is waiting, then take one back.

        Semaphores aren't fair: releasing and immediately re-acquiring would
        usually win the race and starve the waiter. So wait (briefly) until
        the waiter has actually taken the slot before queueing again.
        """
        self.release()
        deadline = time.monotonic() + max_wait_s
        while self.contended() and time.monotonic() < deadline:
            time.sleep(0.05)
        self.acquire(timeout=None)

    @contextmanager
    def slot(self, timeout: float | None = SLOT_TIMEOUT_S) -> Iterator[None]:
        self.acquire(timeout)
        try:
            yield
        finally:
            self.release()


slots = EngineSlots(MAX_PROCESSES)
analysis_lock = threading.Lock()
