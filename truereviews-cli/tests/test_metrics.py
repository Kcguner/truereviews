"""`rapor.pipeline.metrics` testleri — plan §5-A, §9.

Fixture'lar gerçek Apify biçiminden `normalize()` ile geçirilir; "son 90 gün"
penceresi `today` parametresiyle sabitlenir, böylece testler zamana bağlı değil.
"""

from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rapor.config import (  # noqa: E402
    DEFAULT_BANDS,
    DEFAULT_FIELD_MAP,
    Config,
)
from rapor.normalize import normalize  # noqa: E402
from rapor.pipeline.metrics import Metrics, compute_metrics  # noqa: E402
from rapor.schemas import Place, Review  # noqa: E402

FIXTURES = ROOT / "fixtures"
TODAY = datetime.date(2026, 11, 14)


def _load(name: str):
    data = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return normalize(data)


def _config(weights: dict | None = None) -> Config:
    payload = {
        "providers": {"mock": {"name": "mock", "adapter": "mock", "model": "mock"}},
        "steps": {"tag": {"profile": "mock"}, "write": {"profile": "mock"}},
        "field_map": DEFAULT_FIELD_MAP,
        "bands": [dict(band) for band in DEFAULT_BANDS],
    }
    if weights is not None:
        payload["scoring"] = {"weights": weights}
    return Config.model_validate(payload)


def _review(
    rid: str,
    stars: float,
    *,
    day: datetime.date | None = None,
    answered: bool = False,
    detailed: dict[str, float] | None = None,
) -> Review:
    return Review(
        id=rid,
        text="metin",
        stars=stars,
        date=day,
        month=day.strftime("%Y-%m") if day else "",
        answered=answered,
        detailed_ratings=detailed or {},
    )


# ---------------------------------------------------------------------------
# cok fixture — kapsamlı metrikler
# ---------------------------------------------------------------------------


def test_cok_counts_distribution_and_average():
    data = _load("cok")
    metrics = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert metrics.total_reviews == 120
    assert sum(metrics.star_distribution.values()) == 120
    assert metrics.star_distribution == {"1": 0, "2": 13, "3": 16, "4": 39, "5": 52}
    assert metrics.average_stars == 4.1
    assert metrics.positive_ratio == 0.7583  # 91 / 120


def test_cok_monthly_series_sorted_and_counts():
    data = _load("cok")
    metrics = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    months = [point.month for point in metrics.monthly_series]
    assert months == sorted(months)
    assert months[0] == "2025-06"
    assert months[-1] == "2026-11"
    assert len(months) == 18
    assert sum(point.count for point in metrics.monthly_series) == 120
    assert all(1.0 <= point.average <= 5.0 for point in metrics.monthly_series)


def test_cok_recent_90d_fixed_today():
    data = _load("cok")
    metrics = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert metrics.recent_90d.count == 22
    assert metrics.recent_90d.avg == 3.0


def test_cok_response_rate_and_counts():
    data = _load("cok")
    metrics = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert metrics.responded_count == 48
    assert metrics.unanswered_count == 72
    assert metrics.response_rate == 0.4


def test_cok_scope_is_real_data_range():
    data = _load("cok")
    metrics = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert metrics.scope is not None
    assert metrics.scope.start_date == datetime.date(2025, 6, 3)
    assert metrics.scope.end_date == datetime.date(2026, 11, 7)


def test_cok_service_ratings():
    data = _load("cok")
    metrics = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert set(metrics.service_ratings) == {"Atmosfer", "Servis", "Yemek"}
    assert metrics.service_ratings == {"Atmosfer": 4.0, "Servis": 4.1, "Yemek": 4.0}


def test_altpuansiz_service_ratings_empty():
    data = _load("altpuansiz")
    metrics = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert metrics.service_ratings == {}
    assert metrics.total_reviews == 25


def test_az_basic_metrics():
    data = _load("az")
    metrics = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert metrics.total_reviews == 8
    assert metrics.star_distribution == {"1": 1, "2": 1, "3": 1, "4": 2, "5": 3}
    assert metrics.average_stars == 3.6
    assert metrics.positive_ratio == 0.625
    assert metrics.recent_90d.count == 4
    assert metrics.recent_90d.avg == 3.2
    assert metrics.response_rate == 0.5


# ---------------------------------------------------------------------------
# Skor matematiği — elle doğrulanan sentetik girdi
# ---------------------------------------------------------------------------


class _Data:
    def __init__(self, reviews):
        self.place = Place(title="Sentetik")
        self.reviews = reviews


def test_score_weight_math_manual():
    reviews = [
        _review("r1", 5.0, day=TODAY - datetime.timedelta(days=10)),
        _review("r2", 5.0, day=TODAY - datetime.timedelta(days=20)),
        _review("r3", 3.0, day=TODAY - datetime.timedelta(days=200)),
        _review("r4", 1.0, day=TODAY - datetime.timedelta(days=300)),
    ]
    metrics = compute_metrics(_Data(reviews).place, reviews, _config(), today=TODAY)

    # avg = 3.5; 4–5★ = 0.5; son 90 gün = 5.0 (2 yorum)
    # 100 * (0.60*3.5/5 + 0.25*0.5 + 0.15*5.0/5) = 69.5
    assert metrics.average_stars == 3.5
    assert metrics.positive_ratio == 0.5
    assert metrics.recent_90d.count == 2
    assert metrics.recent_90d.avg == 5.0
    assert metrics.score == 69.5
    assert metrics.score_used_fallback is False


def test_score_respects_custom_weights():
    reviews = [
        _review("r1", 5.0, day=TODAY - datetime.timedelta(days=10)),
        _review("r2", 3.0, day=TODAY - datetime.timedelta(days=20)),
    ]
    config = _config({"average": 0.5, "positive_ratio": 0.3, "recent": 0.2})
    metrics = compute_metrics(_Data(reviews).place, reviews, config, today=TODAY)

    # avg=4.0; positive=0.5; recent=4.0
    # 100 * (0.5*0.8 + 0.3*0.5 + 0.2*0.8) = 71.0
    assert metrics.score == 71.0


def test_undated_reviews_count_but_do_not_enter_dated_metrics():
    dated_a = _review("a", 5.0, day=datetime.date(2026, 1, 10))
    dated_b = _review("b", 3.0, day=datetime.date(2026, 3, 10))
    undated = _review("c", 1.0)
    reviews = [dated_a, dated_b, undated]

    metrics = compute_metrics(_Data(reviews).place, reviews, _config(), today=TODAY)

    assert metrics.total_reviews == 3
    assert metrics.star_distribution == {"1": 1, "2": 0, "3": 1, "4": 0, "5": 1}
    assert metrics.average_stars == 3.0
    assert [point.month for point in metrics.monthly_series] == ["2026-01", "2026-03"]
    assert sum(point.count for point in metrics.monthly_series) == 2
    assert metrics.scope is not None
    assert metrics.scope.start_date == datetime.date(2026, 1, 10)
    assert metrics.scope.end_date == datetime.date(2026, 3, 10)


def test_no_dated_reviews_scope_none():
    reviews = [_review("a", 4.0), _review("b", 5.0)]
    metrics = compute_metrics(_Data(reviews).place, reviews, _config(), today=TODAY)

    assert metrics.scope is None
    assert metrics.monthly_series == []
    assert metrics.recent_90d.count == 0
    assert metrics.recent_90d.avg is None
    assert metrics.score_used_fallback is True


# ---------------------------------------------------------------------------
# Fallback + determinizm
# ---------------------------------------------------------------------------


def test_yanitsiz_recent_empty_and_fallback_score():
    data = _load("yanitsiz")
    metrics = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert metrics.recent_90d.count == 0
    assert metrics.recent_90d.avg is None
    assert metrics.score_used_fallback is True
    # avg = 118/30 = 3.9333; positive = 22/30
    # 100 * (0.60*avg/5 + 0.25*positive + 0.15*avg/5) = 77.33
    assert metrics.score == 77.33


def test_freeze_time_matches_explicit_today():
    from freezegun import freeze_time

    data = _load("cok")
    with freeze_time("2026-11-14"):
        frozen = compute_metrics(data.place, data.reviews, _config())
    explicit = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert frozen.model_dump_json() == explicit.model_dump_json()


def test_metrics_deterministic_json():
    data = _load("cok")
    first = compute_metrics(data.place, data.reviews, _config(), today=TODAY)
    second = compute_metrics(data.place, data.reviews, _config(), today=TODAY)

    assert isinstance(first, Metrics)
    assert first.model_dump_json() == second.model_dump_json()
    # dict sıraları sabit: aynı anahtar sırası
    assert list(first.star_distribution) == ["1", "2", "3", "4", "5"]
    assert list(first.service_ratings) == ["Atmosfer", "Servis", "Yemek"]
