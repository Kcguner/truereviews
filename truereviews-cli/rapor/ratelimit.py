"""Profil başına hız sınırı ve günlük kota (plan §3).

Üç katman:

* **semaphore** — profil başına eşzamanlı istek (`concurrency`);
* **token bucket** — `requests_per_minute` (kapasite = rpm, saniyede rpm/60 dolum);
* **günlük kota** — `daily_request_limit`; sayaç `<state_dir>/state.json`
  içinde `{"date": "YYYY-MM-DD", "count": N}`. Gün değişince sıfırlanır.

`RateLimiter.acquire()` senkrondur: pipeline sıralı çalışır, semaphore yine de
thread-safe. Kota dolunca `DailyQuotaExceeded` yükselir; çağıran (pipeline)
koşuyu durdurur, çökmez.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Mapping

__all__ = [
    "DailyQuotaExceeded",
    "Limit",
    "RateLimiter",
    "STATE_FILENAME",
    "get_limiter",
    "reset_limiters",
]

STATE_FILENAME = "state.json"


class DailyQuotaExceeded(RuntimeError):
    """Günlük istek kotası doldu; çağıran koşuyu durdurmalı."""

    def __init__(self, profile_name: str, limit: int, count: int) -> None:
        self.profile_name = profile_name
        self.limit = limit
        self.count = count
        super().__init__(
            f"'{profile_name}' profili için günlük kota doldu "
            f"({count}/{limit}). Yarın devam edin."
        )


def _field(profile: Any, key: str, default: Any = None) -> Any:
    if isinstance(profile, Mapping):
        return profile.get(key, default)
    return getattr(profile, key, default)


@dataclass
class Limit:
    """Bir profilin hız sınırları."""

    concurrency: int = 1
    requests_per_minute: int | None = None
    daily_request_limit: int | None = None

    @classmethod
    def from_profile(cls, profile: Any) -> "Limit":
        return cls(
            concurrency=max(1, int(_field(profile, "concurrency", 1) or 1)),
            requests_per_minute=_optional_int(
                _field(profile, "requests_per_minute")
            ),
            daily_request_limit=_optional_int(
                _field(profile, "daily_request_limit")
            ),
        )


def _optional_int(value: Any) -> int | None:
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


class _Bucket:
    """Token bucket. `clock` saniye cinsinden monotonik zaman döner."""

    def __init__(self, rpm: int, clock: Callable[[], float]) -> None:
        self.capacity = float(rpm)
        self.rate = float(rpm) / 60.0  # token / saniye
        self._clock = clock
        self._tokens = float(rpm)
        self._updated = clock()

    def _refill(self) -> None:
        now = self._clock()
        elapsed = now - self._updated
        if elapsed > 0:
            self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)
            self._updated = now

    def take(self) -> float:
        """Bir token alır; bekleme gerekiyorsa saniye döner (tüketmez)."""
        self._refill()
        if self._tokens >= 1.0:
            return 0.0
        return (1.0 - self._tokens) / self.rate

    def consume(self) -> None:
        self._refill()
        self._tokens = max(0.0, self._tokens - 1.0)


class RateLimiter:
    """Profil başına semaphore + token bucket + günlük kota.

    Args:
        state_dir: günlük kota sayacının tutulduğu dizin (`state.json`).
        clock: saniye cinsinden zaman kaynağı (test için sahte).
        sleeper: uyku fonksiyonu (test için sahte; sahte saatle birlikte ilerletir).
    """

    def __init__(
        self,
        state_dir: str | Path | None = None,
        clock: Callable[[], float] | None = None,
        sleeper: Callable[[float], None] | None = None,
    ) -> None:
        self.state_dir = Path(state_dir) if state_dir is not None else None
        self._clock = clock or time.monotonic
        self._sleep = sleeper or time.sleep
        self._limits: dict[str, Limit] = {}
        self._semaphores: dict[str, threading.Semaphore] = {}
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    # -- kayıt ------------------------------------------------------------

    def register(self, profile: Any, name: str | None = None) -> Limit:
        """Profili (pydantic model veya dict) sınırlarıyla kaydeder."""
        profile_name = name or _field(profile, "name")
        if not profile_name:
            raise ValueError("profil adı yok: profile 'name' alanı gerekli")
        limit = Limit.from_profile(profile)
        with self._lock:
            self._limits[profile_name] = limit
            self._semaphores[profile_name] = threading.Semaphore(limit.concurrency)
            if limit.requests_per_minute:
                self._buckets[profile_name] = _Bucket(
                    limit.requests_per_minute, self._clock
                )
            else:
                self._buckets.pop(profile_name, None)
        return limit

    def limit_for(self, profile_name: str) -> Limit:
        if profile_name not in self._limits:
            self.register({"name": profile_name})
        return self._limits[profile_name]

    # -- günlük kota ------------------------------------------------------

    def _state_path(self) -> Path | None:
        if self.state_dir is None:
            return None
        return self.state_dir / STATE_FILENAME

    def _today(self) -> str:
        try:
            return datetime.fromtimestamp(self._clock()).date().isoformat()
        except (OverflowError, OSError, ValueError):
            return date.today().isoformat()

    def _read_state(self) -> dict[str, Any]:
        path = self._state_path()
        if path is None or not path.is_file():
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError):
            return {}
        return payload if isinstance(payload, dict) else {}

    def _write_state(self, payload: dict[str, Any]) -> None:
        path = self._state_path()
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            prefix=".state.", suffix=".tmp", dir=path.parent
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, sort_keys=True)
            os.replace(tmp_name, path)
        except BaseException:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise

    def daily_count(self) -> tuple[str, int]:
        """`(gün, sayı)`; gün değiştiyse sayı 0 kabul edilir."""
        state = self._read_state()
        today = self._today()
        if state.get("date") != today:
            return today, 0
        try:
            return today, int(state.get("count") or 0)
        except (TypeError, ValueError):
            return today, 0

    def _check_and_count(self, profile_name: str, limit: Limit) -> None:
        if limit.daily_request_limit is None:
            return
        today, count = self.daily_count()
        if count >= limit.daily_request_limit:
            raise DailyQuotaExceeded(profile_name, limit.daily_request_limit, count)
        self._write_state({"date": today, "count": count + 1})

    # -- ana giriş --------------------------------------------------------

    def acquire(self, profile_name: str) -> None:
        """Profil için izin alır: kota → semaphore → token bucket.

        Kota ve bucket sayacı yalnızca izin gerçekten verilince artar.
        """
        limit = self.limit_for(profile_name)
        self._check_and_count(profile_name, limit)

        semaphore = self._semaphores.get(profile_name)
        if semaphore is not None:
            semaphore.acquire()
        try:
            bucket = self._buckets.get(profile_name)
            if bucket is not None:
                while True:
                    wait = bucket.take()
                    if wait <= 0.0:
                        bucket.consume()
                        break
                    self._sleep(wait)
        except BaseException:
            if semaphore is not None:
                semaphore.release()
            raise

    def release(self, profile_name: str) -> None:
        """Semaphore'u serbest bırakır (`with limiter.slot(...)` kullanın)."""
        semaphore = self._semaphores.get(profile_name)
        if semaphore is not None:
            semaphore.release()

    def slot(self, profile_name: str) -> "_Slot":
        """`with limiter.slot("profil"):` — acquire + release."""
        return _Slot(self, profile_name)


class _Slot:
    def __init__(self, limiter: RateLimiter, profile_name: str) -> None:
        self._limiter = limiter
        self._profile_name = profile_name

    def __enter__(self) -> None:
        self._limiter.acquire(self._profile_name)
        return None

    def __exit__(self, *exc_info: Any) -> None:
        self._limiter.release(self._profile_name)
        return None


# --- süreç içi limiter önbelleği -------------------------------------------

_LIMITERS: dict[str, RateLimiter] = {}
_LIMITERS_LOCK = threading.Lock()


def get_limiter(
    state_dir: str | Path | None = None,
    *,
    clock: Callable[[], float] | None = None,
    sleeper: Callable[[float], None] | None = None,
) -> RateLimiter:
    """Aynı state dizini için tek limiter döner (kota sayacı paylaşılır)."""
    key = str(Path(state_dir).expanduser().resolve()) if state_dir else ""
    with _LIMITERS_LOCK:
        existing = _LIMITERS.get(key)
        if existing is not None and clock is None and sleeper is None:
            return existing
        limiter = RateLimiter(state_dir, clock=clock, sleeper=sleeper)
        _LIMITERS[key] = limiter
        return limiter


def reset_limiters() -> None:
    """Testler için süreç içi limiter önbelleğini temizler."""
    with _LIMITERS_LOCK:
        _LIMITERS.clear()
