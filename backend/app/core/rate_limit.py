"""In-process sliding-window limiter for login attempts.

The backend runs as a single process (see CLAUDE.md), so in-memory state is sufficient.
If the API is ever scaled to several workers, move this to PostgreSQL.
"""
import time
from collections import defaultdict, deque

from app.core.config import settings


class LoginRateLimiter:
    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window = window_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._failures[key]
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def _keys(self, ip: str | None, email: str) -> list[str]:
        # Per account+IP, plus a looser per-IP cap against credential spraying.
        return [f"acct:{email.lower()}|{ip}", f"ip:{ip}"]

    def is_blocked(self, ip: str | None, email: str) -> bool:
        now = time.monotonic()
        acct, ip_key = self._keys(ip, email)
        return (len(self._prune(acct, now)) >= self.max_failures
                or len(self._prune(ip_key, now)) >= self.max_failures * 4)

    def record_failure(self, ip: str | None, email: str) -> None:
        now = time.monotonic()
        for k in self._keys(ip, email):
            self._failures[k].append(now)

    def reset(self, ip: str | None, email: str) -> None:
        self._failures.pop(self._keys(ip, email)[0], None)


login_limiter = LoginRateLimiter(settings.login_max_failures, settings.login_window_seconds)
