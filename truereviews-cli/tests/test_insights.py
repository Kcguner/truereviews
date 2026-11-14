"""`rapor.pipeline.insights` testleri — plan §5-A2, §9.

Cümleler yalnızca `Metrics` sayılarından biçimlenir. Tarih sabittir: metrics
`today` parametresiyle üretilir; insights metinleri tarihe bağlı değildir.
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
from rapor.pipeline.insights import (  # noqa: E402
    Insights,
    compute_insights,
    format_month_label,
)
from rapor.pipeline.metrics import (  # noqa: E402
    Metrics,
    MonthlyPoint,
    RecentWindow,
    compute_metrics,
)

FIXTURES = ROOT / "fixtures"
TODAY = datetime.date(2026, 11, 14)


def _config() -> Config:
    return Config.model_validate(
        {
            "providers": {
                "mock": {"name": "mock", "adapter": "mock", "model": "mock"}
            },
            "steps": {"tag": {"profile": "mock"}, "write": {"profile": "mock"}},
            "field_map": DEFAULT_FIELD_MAP,
            "bands": [dict(band) for band in DEFAULT_BANDS],
        }
    )


def _load_metrics(name: str, today: datetime.date = TODAY) -> Metrics:
    data = normalize(
        json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    )
    return compute_metrics(data.place, data.reviews, _config(), today=today)


def _metrics(
    *,
    score: float | None = 80.0,
    average_stars: float | None = 4.0,
    recent_avg: float | None = None,
    recent_count: int = 0,
    monthly: list[tuple[str, float]] | None = None,
    response_rate: float | None = 1.0,
    unanswered: int = 0,
    fallback: bool = False,
) -> Metrics:
    return Metrics(
        total_reviews=10,
        star_distribution={str(i): 2 for i in range(1, 6)},
        average_stars=average_stars,
        positive_ratio=0.5,
        monthly_series=[
            MonthlyPoint(month=month, count=2, average=average)
            for month, average in (monthly or [])
        ],
        recent_90d=RecentWindow(count=recent_count, avg=recent_avg),
        responded_count=10 - unanswered,
        unanswered_count=unanswered,
        response_rate=response_rate,
        service_ratings={},
        scope=None,
        score=score,
        score_used_fallback=fallback,
    )


# ---------------------------------------------------------------------------
# Bant sınırları — 49/50/69/70/84/85
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("score", "label"),
    [
        (0, "Zayıf"),
        (49, "Zayıf"),
        (50, "Orta"),
        (69, "Orta"),
        (70, "İyi"),
        (84, "İyi"),
        (85, "Çok iyi"),
        (100, "Çok iyi"),
    ],
)
def test_band_boundaries_tr(score, label):
    insights = compute_insights(
        _metrics(score=score), config=_config(), lang="tr"
    )
    assert insights.band_label == label


@pytest.mark.parametrize(
    ("score", "label"),
    [(49, "Weak"), (50, "Fair"), (70, "Good"), (85, "Very good")],
)
def test_band_boundaries_en(score, label):
    insights = compute_insights(
        _metrics(score=score), config=_config(), lang="en"
    )
    assert insights.band_label == label


def test_no_signal_verdict_is_band_only():
    insights = compute_insights(_metrics(score=82), config=_config(), lang="tr")

    assert insights.verdict == "İyi — müşteriler genel olarak memnun."
    assert insights.signal is None
    assert insights.trend is None
    assert insights.anomaly is None


# ---------------------------------------------------------------------------
# cok fixture — verdict, trend, anomali
# ---------------------------------------------------------------------------


def test_cok_verdict_includes_strongest_signal():
    metrics = _load_metrics("cok")
    insights = compute_insights(metrics, config=_config(), lang="tr")

    assert metrics.score == 76.96
    assert insights.band_label == "İyi"
    assert insights.signal == "trend"
    assert insights.verdict == (
        "İyi — müşteriler genel olarak memnun; "
        "son 3 ayda ortalama puan 1,1 yıldız geriledi."
    )


def test_cok_trend_sentence_real_numbers():
    metrics = _load_metrics("cok")
    insights = compute_insights(metrics, config=_config(), lang="tr")

    assert metrics.average_stars == 4.1
    assert metrics.recent_90d.avg == 3.0
    assert insights.trend == "Son 3 ayda ortalama puan 1,1 yıldız geriledi."


def test_cok_trend_sentence_en():
    insights = compute_insights(_load_metrics("cok"), config=_config(), lang="en")

    assert insights.trend == (
        "The average rating fell by 1.1 stars in the last 3 months."
    )
    assert insights.band_label == "Good"


def test_cok_anomaly_months_and_count():
    insights = compute_insights(_load_metrics("cok"), config=_config(), lang="tr")

    assert insights.anomaly_months == [
        "Kas 2025",
        "Nis 2026",
        "Ağu 2026",
        "Eyl 2026",
        "Eki 2026",
        "Kas 2026",
    ]
    assert insights.anomaly == (
        "Kırmızı noktalar: Kas 2025, Nis 2026, Ağu 2026, Eyl 2026, "
        "Eki 2026, Kas 2026 — ortalama puanın 4,0'ın altına indiği 6 ay."
    )


def test_cok_anomaly_en():
    insights = compute_insights(_load_metrics("cok"), config=_config(), lang="en")

    assert insights.anomaly_months[0] == "Nov 2025"
    assert "6 months" in insights.anomaly
    assert "below 4.0" in insights.anomaly


def test_no_anomaly_below_threshold_only():
    # 4.0 tam eşik anomali değildir; üstü de değil.
    metrics = _metrics(score=90.0, monthly=[("2026-01", 4.0), ("2026-02", 4.5)])
    insights = compute_insights(metrics, config=_config(), lang="tr")

    assert insights.anomaly is None
    assert insights.anomaly_months == []


def test_custom_anomaly_threshold_from_config():
    class ConfigWithThreshold:
        anomaly_threshold = 4.5

        def band_for(self, score):
            return _config().band_for(score)

    metrics = _metrics(score=90.0, monthly=[("2026-01", 4.2), ("2026-02", 4.8)])
    insights = compute_insights(
        metrics, config=ConfigWithThreshold(), lang="tr"
    )

    assert insights.anomaly_months == ["Oca 2026"]
    assert "4,5" in insights.anomaly


# ---------------------------------------------------------------------------
# yanitsiz fixture — trend yok, fallback notu var, yanıt boşluğu
# ---------------------------------------------------------------------------


def test_yanitsiz_no_trend_but_fallback_note():
    metrics = _load_metrics("yanitsiz")
    insights = compute_insights(metrics, config=_config(), lang="tr")

    assert metrics.recent_90d.count == 0
    assert metrics.score_used_fallback is True
    assert insights.trend is None
    assert insights.fallback_note == (
        "Son 90 günde yorum yok; skor genel ortalamayla hesaplandı."
    )


def test_yanitsiz_response_gap_sentence():
    insights = compute_insights(_load_metrics("yanitsiz"), config=_config(), lang="tr")

    assert insights.response_gap == (
        "Yorumların yanıtlanma oranı %0; 30 yorum yanıt bekliyor."
    )
    assert insights.response_section_visible is True


def test_response_gap_en():
    insights = compute_insights(_load_metrics("yanitsiz"), config=_config(), lang="en")

    assert insights.response_gap == (
        "Only 0% of reviews have a reply; 30 reviews are waiting for an answer."
    )


def test_response_rate_100_hides_section():
    insights = compute_insights(
        _metrics(score=85.0, response_rate=1.0), config=_config(), lang="tr"
    )

    assert insights.response_gap is None
    assert insights.response_section_visible is False


@pytest.mark.parametrize("rate", [0.5, 0.7, 0.999])
def test_response_rate_between_half_and_full_visible_without_gap(rate):
    insights = compute_insights(
        _metrics(score=75.0, response_rate=rate, unanswered=2),
        config=_config(),
        lang="tr",
    )

    assert insights.response_gap is None
    assert insights.response_section_visible is True


# ---------------------------------------------------------------------------
# Biçim, dil, determinizm
# ---------------------------------------------------------------------------


def test_turkish_and_english_number_format():
    # az: avg 3.6, recent 3.2 -> fark 0,4 / 0.4
    tr = compute_insights(_load_metrics("az"), config=_config(), lang="tr")
    en = compute_insights(_load_metrics("az"), config=_config(), lang="en")

    assert "0,4 yıldız" in tr.trend
    assert "0.4 stars" in en.trend


def test_format_month_label():
    assert format_month_label("2026-11", "tr") == "Kas 2026"
    assert format_month_label("2026-11", "en") == "Nov 2026"
    assert format_month_label("bozuk", "tr") == "bozuk"


def test_insights_deterministic():
    metrics = _load_metrics("cok")
    first = compute_insights(metrics, config=_config(), lang="tr")
    second = compute_insights(metrics, config=_config(), lang="tr")

    assert isinstance(first, Insights)
    assert first.model_dump_json() == second.model_dump_json()


def test_unknown_lang_falls_back_to_turkish():
    insights = compute_insights(_load_metrics("cok"), config=_config(), lang="de")

    assert insights.band_label == "İyi"
    assert insights.trend.startswith("Son 3 ayda")
