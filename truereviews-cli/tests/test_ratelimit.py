"""`rapor/ratelimit.py` testleri (plan §3)."""

from __future__ import annotations

import pytest

from rapor.ratelimit import DailyQuotaExceeded, RateLimiter, reset_limiters

DAY = 24 * 60 * 60
BASE = 1_700_000_000.0  # sabit epoch; gün hesabı için gerçek tarih gerekir


class FakeClock:
    def __init__(self, start: float = BASE) -> None:
        self.now = start
        self.slept = 0.0

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept += seconds
        self.now += seconds


def make_limiter(tmp_path, clock, **limit):
    limiter = RateLimiter(tmp_path, clock=clock, sleeper=clock.sleep)
    profile = {"name": "p", "concurrency": 1}
    profile.update(limit)
    limiter.register(profile)
    return limiter


def take(limiter, name="p"):
    """acquire + release (izini serbest bırakır; sonraki istek beklemez)."""
    limiter.acquire(name)
    limiter.release(name)


def test_token_bucket_waits_after_capacity(tmp_path):
    clock = FakeClock()
    limiter = make_limiter(tmp_path, clock, requests_per_minute=3)
    for _ in range(3):
        take(limiter)
    assert clock.slept == 0.0
    # 4. istek için 1 token = 20 saniye beklenir (60/3).
    take(limiter)
    assert clock.slept == pytest.approx(20.0, rel=1e-6)


def test_token_bucket_refills_over_time(tmp_path):
    clock = FakeClock()
    limiter = make_limiter(tmp_path, clock, requests_per_minute=60)
    for _ in range(60):
        take(limiter)
    assert clock.slept == 0.0
    clock.now += 5.0  # 60 rpm -> 5 token
    for _ in range(5):
        take(limiter)
    assert clock.slept == 0.0
    take(limiter)
    assert clock.slept == pytest.approx(1.0, rel=1e-6)


def test_acquire_holds_semaphore_until_release(tmp_path):
    import threading

    clock = FakeClock()
    limiter = make_limiter(tmp_path, clock)
    limiter.acquire("p")  # serbest bırakılmadı

    acquired = threading.Event()

    def worker():
        limiter.acquire("p")
        acquired.set()
        limiter.release("p")

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    assert not acquired.wait(0.2)
    limiter.release("p")
    assert acquired.wait(2.0)
    thread.join(timeout=5)


def test_slot_context_releases(tmp_path):
    clock = FakeClock()
    limiter = make_limiter(tmp_path, clock)
    for _ in range(3):
        with limiter.slot("p"):
            pass


def test_daily_quota_raises(tmp_path):
    clock = FakeClock()
    limiter = make_limiter(tmp_path, clock, daily_request_limit=2)
    take(limiter)
    take(limiter)
    with pytest.raises(DailyQuotaExceeded) as exc:
        take(limiter)
    assert exc.value.limit == 2
    assert exc.value.count == 2


def test_daily_quota_resets_next_day(tmp_path):
    clock = FakeClock()
    limiter = make_limiter(tmp_path, clock, daily_request_limit=1)
    take(limiter)
    with pytest.raises(DailyQuotaExceeded):
        take(limiter)

    clock.now += DAY
    take(limiter)  # yeni gün, sayaç sıfır
    with pytest.raises(DailyQuotaExceeded):
        take(limiter)


def test_daily_quota_persists_across_instances(tmp_path):
    clock = FakeClock()
    take(make_limiter(tmp_path, clock, daily_request_limit=1))
    second = make_limiter(tmp_path, clock, daily_request_limit=1)
    with pytest.raises(DailyQuotaExceeded):
        second.acquire("p")


def test_semaphore_is_thread_safe(tmp_path):
    import threading

    clock = FakeClock()
    limiter = RateLimiter(tmp_path, clock=clock, sleeper=clock.sleep)
    limiter.register({"name": "p", "concurrency": 2})

    def worker():
        limiter.acquire("p")
        limiter.release("p")

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)
    assert all(not thread.is_alive() for thread in threads)


def test_get_limiter_caches_per_state_dir(tmp_path):
    from rapor.ratelimit import get_limiter

    reset_limiters()
    first = get_limiter(tmp_path)
    second = get_limiter(tmp_path)
    assert first is second
    assert get_limiter(tmp_path / "other") is not first
    reset_limiters()


def test_no_limits_means_unlimited(tmp_path):
    clock = FakeClock()
    limiter = RateLimiter(tmp_path, clock=clock, sleeper=clock.sleep)
    limiter.register({"name": "p"})
    for _ in range(100):
        take(limiter)
    assert clock.slept == 0.0
