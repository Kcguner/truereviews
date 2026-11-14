"""`rapor/providers/base.py` sözleşme testleri (plan §3)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from rapor import cache as cache_store
from rapor import ratelimit as ratelimit_mod
from rapor import usage as usage_store
from rapor.providers import base as base_module
from rapor.providers.base import AdapterResult, AdapterUsage, LLMResult, generate_json


def make_profile(**overrides):
    profile = {
        "name": "test-profil",
        "adapter": "fake",
        "model": "fake-1",
        "thinking": "low",
        "max_tokens": 256,
        "concurrency": 1,
        "requests_per_minute": 600,
        "daily_request_limit": 50,
        "api_key_env": "FAKE_API_KEY",
        "pricing": {"input": 1.0, "output": 2.0},
    }
    profile.update(overrides)
    return profile


class FakeAdapter:
    def __init__(self, payload=None, usage=None):
        self.calls: list[dict] = []
        self.payload = payload if payload is not None else {"ok": True}
        self.usage = usage or AdapterUsage(
            input_tokens=10,
            output_tokens=5,
            thinking_tokens=2,
            duration_s=0.25,
        )

    def generate(self, profile, system, user, schema, thinking, max_tokens, api_key):
        self.calls.append(
            {
                "profile": profile,
                "system": system,
                "user": user,
                "schema": schema,
                "thinking": thinking,
                "max_tokens": max_tokens,
                "api_key": api_key,
            }
        )
        return AdapterResult(data=self.payload, usage=self.usage)

    @property
    def module(self):
        return SimpleNamespace(generate=self.generate)


@pytest.fixture
def fake(monkeypatch):
    adapter = FakeAdapter()
    monkeypatch.setattr(base_module, "get_adapter", lambda name: adapter.module)
    monkeypatch.setenv("FAKE_API_KEY", "sk-test")
    return adapter


@pytest.fixture
def out_dir(tmp_path):
    directory = tmp_path / "out" / "ornek-mekan"
    directory.mkdir(parents=True)
    return directory


def test_generate_json_returns_llm_result(fake, out_dir):
    result = generate_json(
        make_profile(),
        "sistem",
        "kullanıcı",
        {"type": "object"},
        "medium",
        128,
        out_dir=out_dir,
        step="tag",
    )
    assert isinstance(result, LLMResult)
    assert result.cached is False
    assert result.data == {"ok": True}
    assert result.usage.input_tokens == 10
    assert result.usage.output_tokens == 5
    assert result.usage.thinking_tokens == 2


def test_thinking_and_max_tokens_override_profile(fake, out_dir):
    generate_json(make_profile(), "s", "u", None, "high", 999, out_dir=out_dir)
    call = fake.calls[0]
    assert call["thinking"] == "high"
    assert call["max_tokens"] == 999
    assert call["api_key"] == "sk-test"


def test_thinking_and_max_tokens_fall_back_to_profile(fake, out_dir):
    generate_json(make_profile(), "s", "u", None, None, None, out_dir=out_dir)
    call = fake.calls[0]
    assert call["thinking"] == "low"
    assert call["max_tokens"] == 256


def test_api_key_explicit_wins(fake, out_dir):
    generate_json(
        make_profile(), "s", "u", None, None, None, api_key="explicit", out_dir=out_dir
    )
    assert fake.calls[0]["api_key"] == "explicit"


def test_cache_hit_skips_adapter_and_marks_cached(fake, out_dir):
    profile = make_profile()
    first = generate_json(profile, "s", "u", None, None, None, out_dir=out_dir)
    second = generate_json(profile, "s", "u", None, None, None, out_dir=out_dir)
    assert first.cached is False
    assert second.cached is True
    assert len(fake.calls) == 1
    assert second.data == first.data
    assert second.usage.input_tokens == 10


def test_cache_file_written_once(fake, out_dir):
    profile = make_profile()
    generate_json(profile, "s", "u", None, None, None, out_dir=out_dir)
    generate_json(profile, "s", "u", None, None, None, out_dir=out_dir)
    stats = cache_store.stats(out_dir.parent.parent)
    assert stats["files"] == 1


def test_use_cache_false_writes_nothing(fake, out_dir):
    profile = make_profile()
    generate_json(profile, "s", "u", None, None, None, out_dir=out_dir, use_cache=False)
    generate_json(profile, "s", "u", None, None, None, out_dir=out_dir, use_cache=False)
    assert len(fake.calls) == 2
    assert cache_store.stats(out_dir.parent.parent)["files"] == 0


def test_usage_recorded_with_cost(fake, out_dir):
    generate_json(
        make_profile(), "s", "u", None, None, None, out_dir=out_dir, step="write"
    )
    payload = json.loads((out_dir / "usage.json").read_text(encoding="utf-8"))
    assert len(payload["calls"]) == 1
    entry = payload["calls"][0]
    assert entry["step"] == "write"
    assert entry["profile"] == "test-profil"
    assert entry["model"] == "fake-1"
    assert entry["cached"] is False
    # 10 * 1.0 + (5 + 2) * 2.0 = 24 USD / 1M token
    assert entry["cost"] == pytest.approx(24 / 1_000_000, rel=1e-6)
    assert payload["totals"]["calls"] == 1


def test_cached_call_is_also_recorded(fake, out_dir):
    profile = make_profile()
    generate_json(profile, "s", "u", None, None, None, out_dir=out_dir)
    generate_json(profile, "s", "u", None, None, None, out_dir=out_dir)
    totals = usage_store.summary(out_dir)
    assert totals["calls"] == 2
    assert totals["cached_calls"] == 1


def test_ratelimit_acquire_and_daily_counter(fake, out_dir):
    generate_json(make_profile(), "s", "u", None, None, None, out_dir=out_dir)
    state_path = out_dir.parent.parent / ".state" / "state.json"
    assert state_path.is_file()
    state = json.loads(state_path.read_text(encoding="utf-8"))
    assert state["count"] == 1


def test_daily_quota_exceeded_propagates(fake, out_dir):
    profile = make_profile(daily_request_limit=1)
    generate_json(profile, "s", "u", None, None, None, out_dir=out_dir)
    with pytest.raises(ratelimit_mod.DailyQuotaExceeded):
        generate_json(profile, "s", "u-2", None, None, None, out_dir=out_dir)
    assert len(fake.calls) == 1


def test_missing_adapter_field_raises(out_dir):
    with pytest.raises(ValueError, match="adapter"):
        generate_json({"name": "x", "model": "m"}, "s", "u", None, None, None)


def test_profile_name_required(fake, out_dir):
    with pytest.raises(ValueError, match="profil adı"):
        generate_json({"adapter": "fake", "model": "m"}, "s", "u", None, None, None)
