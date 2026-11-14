"""`rapor.pipeline.tag` testleri — plan §5-B, §9.

Mock adaptör kullanılır: ağ yok, deterministik. Grup sayısı adaptör çağrı
sayacıyla doğrulanır; cache/state davranışı ayrı testlerde izole edilir.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rapor.config import DEFAULT_BANDS, DEFAULT_FIELD_MAP, Config  # noqa: E402
from rapor.normalize import normalize  # noqa: E402
from rapor.pipeline.tag import TagResult, tag_reviews, tag_schema  # noqa: E402
from rapor.providers.base import AdapterResult, AdapterUsage  # noqa: E402
from rapor.providers import mock as mock_adapter  # noqa: E402
from rapor.schemas import TagItem  # noqa: E402
from rapor.state import RunState  # noqa: E402

FIXTURES = ROOT / "fixtures"


# --- yardımcılar -----------------------------------------------------------


def _reviews(name: str):
    data = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return normalize(data).reviews


def _config(group_size: int = 20, max_group_retries: int = 2) -> Config:
    return Config.model_validate(
        {
            "providers": {
                "mock": {
                    "name": "mock",
                    "adapter": "mock",
                    "model": "mock-1",
                    "max_tokens": 4096,
                }
            },
            "steps": {"tag": {"profile": "mock"}, "write": {"profile": "mock"}},
            "field_map": DEFAULT_FIELD_MAP,
            "bands": [dict(band) for band in DEFAULT_BANDS],
            "tagging": {
                "group_size": group_size,
                "max_group_retries": max_group_retries,
            },
        }
    )


def _out_dir(tmp_path: Path) -> Path:
    # `out/<slug>` biçimi cache kökünü tmp_path yapar (izolasyon).
    directory = tmp_path / "out" / "mekan"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


@pytest.fixture
def adapter_calls(monkeypatch):
    """Mock adaptörün gerçek `generate` çağrılarını sayar (cache isabeti sayılmaz)."""
    original = mock_adapter.generate
    counter = {"n": 0}

    def counting(*args, **kwargs):
        counter["n"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(mock_adapter, "generate", counting)
    return counter


def _bad_result(data, usage_from=None) -> AdapterResult:
    return AdapterResult(
        data=data,
        usage=usage_from.usage if usage_from is not None else AdapterUsage(),
    )


# --- şema ------------------------------------------------------------------


def test_tag_schema_is_array_of_tag_item():
    schema = tag_schema()
    assert schema["type"] == "array"
    assert schema["items"]["type"] == "object"
    assert "sentiment" in schema["items"]["properties"]


# --- gruplama --------------------------------------------------------------


def test_cok_fixture_six_groups_all_tagged(adapter_calls, tmp_path):
    reviews = _reviews("cok")
    assert len(reviews) == 120

    result = tag_reviews(reviews, _config(), _out_dir(tmp_path))

    assert isinstance(result, TagResult)
    assert adapter_calls["n"] == 6, "120 yorum / 20 = 6 grup, 6 adaptör çağrısı"
    assert result.warnings == []
    assert len(result) == 120
    assert [item.id for item in result] == [review.id for review in reviews]
    assert len({item.id for item in result}) == 120
    for item in result:
        assert isinstance(item, TagItem)
        assert item.sentiment in {"positive", "negative", "neutral"}
        assert 1 <= item.severity <= 3
        assert 0 <= len(item.topics) <= 3


def test_az_fixture_single_group(adapter_calls, tmp_path):
    reviews = _reviews("az")
    assert len(reviews) == 8

    result = tag_reviews(reviews, _config(), _out_dir(tmp_path))

    assert adapter_calls["n"] == 1
    assert len(result) == 8
    assert result.by_id()[reviews[0].id].id == reviews[0].id


def test_empty_reviews_makes_no_call(adapter_calls, tmp_path):
    result = tag_reviews([], _config(), _out_dir(tmp_path))
    assert len(result) == 0
    assert result.warnings == []
    assert adapter_calls["n"] == 0


# --- retry / hata ----------------------------------------------------------


def test_group_retry_after_bad_output(monkeypatch, adapter_calls, tmp_path):
    original = mock_adapter.generate
    seen = {"n": 0}

    def flaky(*args, **kwargs):
        seen["n"] += 1
        if seen["n"] == 1:
            good = original(*args, **kwargs)
            return _bad_result({"unexpected": "shape"}, good)  # dizi değil
        return original(*args, **kwargs)

    monkeypatch.setattr(mock_adapter, "generate", flaky)

    reviews = _reviews("az")
    result = tag_reviews(reviews, _config(), _out_dir(tmp_path))

    assert seen["n"] == 2, "ilk deneme bozuk, ikinci deneme düzgün"
    assert result.warnings == []
    assert len(result) == 8
    assert {item.id for item in result} == {review.id for review in reviews}


def test_group_left_untagged_when_always_bad(monkeypatch, adapter_calls, tmp_path):
    def broken(*args, **kwargs):
        adapter_calls["n"] += 1
        return _bad_result([])  # her yorum eksik

    monkeypatch.setattr(mock_adapter, "generate", broken)

    reviews = _reviews("az")
    config = _config(max_group_retries=1)
    result = tag_reviews(reviews, config, _out_dir(tmp_path))

    assert adapter_calls["n"] == 2, "1 ilk deneme + 1 retry"
    assert len(result) == 0
    assert len(result.warnings) == 1
    assert "grup 1/1" in result.warnings[0]
    assert "etiketlenemedi" in result.warnings[0]


def test_duplicate_or_missing_ids_trigger_retry(monkeypatch, adapter_calls, tmp_path):
    original = mock_adapter.generate
    seen = {"n": 0}

    def wrong_coverage(*args, **kwargs):
        seen["n"] += 1
        if seen["n"] == 1:
            good = original(*args, **kwargs)
            duplicated = [good.data[0], good.data[0]]  # eksik + çift id
            return _bad_result(duplicated, good)
        return original(*args, **kwargs)

    monkeypatch.setattr(mock_adapter, "generate", wrong_coverage)

    reviews = _reviews("az")
    result = tag_reviews(reviews, _config(), _out_dir(tmp_path))

    assert seen["n"] == 2
    assert len(result) == 8
    assert len({item.id for item in result}) == 8


# --- state devamı ----------------------------------------------------------


def test_state_resume_only_runs_missing_group(adapter_calls, tmp_path):
    reviews = _reviews("az")[:2]
    out_dir = _out_dir(tmp_path)
    seeded = TagItem(
        id=reviews[0].id,
        sentiment="positive",
        topics=["kahve"],
        products=["flat white"],
        severity=1,
    )
    RunState(out_dir).record_group(0, [seeded])

    result = tag_reviews(
        reviews, _config(group_size=1), out_dir
    )

    assert adapter_calls["n"] == 1, "yalnızca 2. grup için çağrı"
    assert len(result) == 2
    assert result[0].id == reviews[0].id
    assert result[0].sentiment == "positive"
    assert result[1].id == reviews[1].id
    assert RunState(out_dir).is_done(1)


def test_state_written_group_by_group(tmp_path):
    reviews = _reviews("az")
    out_dir = _out_dir(tmp_path)
    tag_reviews(reviews, _config(), out_dir)

    state = RunState(out_dir)
    assert state.completed_groups == [0]
    assert len(state.group_result(0)) == 8


# --- cache / determinizm ---------------------------------------------------


def test_second_run_hits_cache_without_adapter_call(adapter_calls, tmp_path):
    reviews = _reviews("cok")
    out_dir = _out_dir(tmp_path)

    first = tag_reviews(reviews, _config(), out_dir)
    assert adapter_calls["n"] == 6

    # state devamını devre dışı bırak: yalnızca sağlayıcı cache'i test edilir.
    (out_dir / "state.json").unlink()
    second = tag_reviews(reviews, _config(), out_dir)

    assert adapter_calls["n"] == 6, "cache isabeti adaptör çağrısı yapmaz"
    assert [item.model_dump() for item in first] == [
        item.model_dump() for item in second
    ]


def test_use_cache_false_forces_calls(adapter_calls, tmp_path):
    reviews = _reviews("az")
    out_dir = _out_dir(tmp_path)

    tag_reviews(reviews, _config(), out_dir)
    (out_dir / "state.json").unlink()
    tag_reviews(reviews, _config(), out_dir, use_cache=False)

    assert adapter_calls["n"] == 2
