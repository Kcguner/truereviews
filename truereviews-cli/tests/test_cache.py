"""`rapor/cache.py` testleri (plan §3)."""

from __future__ import annotations

import json

from rapor import cache


def test_same_input_same_key():
    key_a = cache.key_for("gemini", "m", "low", 100, {"a": 1}, "sys", "user")
    key_b = cache.key_for("gemini", "m", "low", 100, {"a": 1}, "sys", "user")
    assert key_a == key_b
    assert len(key_a) == 64


def test_different_thinking_different_key():
    key_a = cache.key_for("gemini", "m", "low", 100, None, "sys", "user")
    key_b = cache.key_for("gemini", "m", "high", 100, None, "sys", "user")
    assert key_a != key_b


def test_different_schema_order_is_deterministic():
    # Sözlük sırası farklı, içerik aynı -> aynı anahtar (sort_keys).
    key_a = cache.key_for("a", "m", None, 1, {"b": 2, "a": 1}, "s", "u")
    key_b = cache.key_for("a", "m", None, 1, {"a": 1, "b": 2}, "s", "u")
    assert key_a == key_b


def test_all_key_components_matter():
    base = dict(
        adapter="a",
        model="m",
        thinking="low",
        max_tokens=10,
        schema=None,
        system="s",
        user="u",
    )
    reference = cache.key_for(**base)
    changes = [
        {"adapter": "b"},
        {"model": "n"},
        {"thinking": "high"},
        {"max_tokens": 11},
        {"schema": {"x": 1}},
        {"system": "s2"},
        {"user": "u2"},
    ]
    for change in changes:
        params = {**base, **change}
        assert cache.key_for(**params) != reference, change


def test_put_get_roundtrip(tmp_path):
    key = cache.key_for("a", "m", None, 1, None, "s", "u")
    cache.put(tmp_path, key, {"value": 42}, {"input_tokens": 3})
    hit = cache.get(tmp_path, key)
    assert hit is not None
    assert hit["data"] == {"value": 42}
    assert hit["usage"]["input_tokens"] == 3
    assert (tmp_path / ".cache" / "llm" / f"{key}.json").is_file()


def test_put_usage_model_dump(tmp_path):
    from rapor.providers.base import AdapterUsage

    key = "k" * 64
    cache.put(tmp_path, key, [1, 2], AdapterUsage(input_tokens=7))
    hit = cache.get(tmp_path, key)
    assert hit is not None
    assert hit["usage"]["input_tokens"] == 7


def test_get_missing_returns_none(tmp_path):
    assert cache.get(tmp_path, "yok") is None


def test_get_corrupt_returns_none(tmp_path):
    path = cache.cache_path(tmp_path, "bozuk")
    path.parent.mkdir(parents=True)
    path.write_text("{bozuk json", encoding="utf-8")
    assert cache.get(tmp_path, "bozuk") is None


def test_stats_and_clear(tmp_path):
    for index in range(3):
        cache.put(tmp_path, f"k{index}", {"i": index}, {})
    stats = cache.stats(tmp_path)
    assert stats["files"] == 3
    assert stats["bytes"] > 0
    assert cache.clear(tmp_path) == 3
    assert cache.stats(tmp_path) == {"files": 0, "bytes": 0}
    assert cache.clear(tmp_path) == 0


def test_cache_file_shape(tmp_path):
    key = "a" * 64
    cache.put(tmp_path, key, {"ok": True}, {"output_tokens": 1})
    payload = json.loads((cache.cache_path(tmp_path, key)).read_text(encoding="utf-8"))
    assert set(payload) == {"data", "usage"}
