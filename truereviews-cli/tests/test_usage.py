"""`rapor/usage.py` testleri (plan §3, §7)."""

from __future__ import annotations

import json

import pytest

from rapor import usage


def entry(**overrides):
    payload = {
        "step": "tag",
        "profile": "gemini-flash",
        "model": "gemini-3.8-flash",
        "input_tokens": 100,
        "output_tokens": 20,
        "thinking_tokens": 5,
        "duration_s": 1.5,
        "cached": False,
        "cost": 0.001,
    }
    payload.update(overrides)
    return payload


def test_record_appends_and_totals(tmp_path):
    usage.record(tmp_path, entry())
    totals = usage.record(tmp_path, entry(input_tokens=50, output_tokens=10))
    assert totals["calls"] == 2
    assert totals["input_tokens"] == 150
    assert totals["output_tokens"] == 30
    assert totals["thinking_tokens"] == 10
    assert totals["total_tokens"] == 190
    assert totals["duration_s"] == pytest.approx(3.0)
    payload = json.loads((tmp_path / "usage.json").read_text(encoding="utf-8"))
    assert len(payload["calls"]) == 2
    assert payload["calls"][0]["step"] == "tag"


def test_cost_none_when_price_missing(tmp_path):
    totals = usage.record(tmp_path, entry(cost=None))
    assert totals["cost"] is None
    payload = json.loads((tmp_path / "usage.json").read_text(encoding="utf-8"))
    assert payload["calls"][0]["cost"] is None


def test_cost_is_summed(tmp_path):
    usage.record(tmp_path, entry(cost=0.002))
    totals = usage.record(tmp_path, entry(cost=0.003))
    assert totals["cost"] == pytest.approx(0.005)


def test_cached_calls_counted(tmp_path):
    usage.record(tmp_path, entry(cached=True))
    totals = usage.record(tmp_path, entry(cached=False))
    assert totals["cached_calls"] == 1


def test_record_creates_directory(tmp_path):
    target = tmp_path / "out" / "mekan"
    usage.record(target, entry())
    assert (target / "usage.json").is_file()


def test_summary_missing_file_returns_zeros(tmp_path):
    totals = usage.summary(tmp_path)
    assert totals["calls"] == 0
    assert totals["total_tokens"] == 0
    assert totals["cost"] is None


def test_estimate_cost_from_profile_mapping():
    profile = {"pricing": {"input": 2.0, "output": 4.0}}
    result = usage.estimate_cost(profile, {"input_tokens": 1_000_000, "output_tokens": 0})
    assert result == pytest.approx(2.0)
    result = usage.estimate_cost(
        profile, {"input_tokens": 0, "output_tokens": 500_000}
    )
    assert result == pytest.approx(2.0)


def test_estimate_cost_thinking_at_output_price():
    profile = {"pricing": {"input": 0.0, "output": 1.0}}
    result = usage.estimate_cost(
        profile, {"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 1_000_000}
    )
    assert result == pytest.approx(1.0)


def test_estimate_cost_none_without_pricing():
    assert usage.estimate_cost({}, {"input_tokens": 10}) is None
    assert usage.estimate_cost(None, {"input_tokens": 10}) is None
    assert usage.estimate_cost({"pricing": {"input": 1.0}}, {"input_tokens": 1}) is None


def test_turkish_alias_keys_are_accepted(tmp_path):
    totals = usage.record(
        tmp_path,
        {"adım": "write", "profil": "p", "model": "m", "in": 5, "out": 2,
         "thinking": 1, "süre": 0.5, "tahmini_maliyet": None},
    )
    assert totals["input_tokens"] == 5
    assert totals["total_tokens"] == 8
    assert totals["duration_s"] == pytest.approx(0.5)
    payload = json.loads((tmp_path / "usage.json").read_text(encoding="utf-8"))
    assert payload["calls"][0]["step"] == "write"
    assert payload["calls"][0]["profile"] == "p"
