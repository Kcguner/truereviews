"""A adımı — deterministik metrikler ve 0–100 skor (plan §5-A).

Model yok. Aynı ``Place``/``Review`` girdisi her çağrıda birebir aynı
``Metrics`` çıktısını üretir: tüm sıralamalar ve sözlük anahtarları sabittir,
``datetime.date.today()`` yalnızca "son 90 gün" penceresini belirler ve
``today`` parametresiyle sabitlenebilir.

Tarihi olmayan yorumlar (``date is None``) toplam sayıma, puan dağılımına,
ortalamaya, olumlu orana, yanıt oranına ve hizmet ortalamalarına girer; aylık
seri, son 90 gün ve kapsam hesabına girmez.
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from typing import Any, Iterable, Mapping

from pydantic import BaseModel, ConfigDict

from rapor.schemas import Place, Review

__all__ = [
    "MonthlyPoint",
    "RecentWindow",
    "Scope",
    "Metrics",
    "compute_metrics",
]

RECENT_WINDOW_DAYS = 90
DEFAULT_WEIGHTS = (0.60, 0.25, 0.15)


# ---------------------------------------------------------------------------
# Modeller
# ---------------------------------------------------------------------------


class MonthlyPoint(BaseModel):
    """Aylık ortalama ve yorum sayısı. ``month`` = "YYYY-MM"."""

    model_config = ConfigDict(extra="ignore")

    month: str
    count: int
    average: float


class RecentWindow(BaseModel):
    """Son 90 gün. Yorum yoksa ``count=0``, ``avg=None``."""

    model_config = ConfigDict(extra="ignore")

    count: int
    avg: float | None = None


class Scope(BaseModel):
    """Verinin gerçekten kapsadığı tarih aralığı (tarihli yorumlardan)."""

    model_config = ConfigDict(extra="ignore")

    start_date: datetime.date
    end_date: datetime.date


class Metrics(BaseModel):
    """``metrics.json`` sözleşmesi. Tüm alanlar koddan gelir."""

    model_config = ConfigDict(extra="ignore")

    total_reviews: int
    star_distribution: dict[str, int]  # "1".."5" -> sayı, hepsi daima var
    average_stars: float | None  # 0.1 hassasiyet
    positive_ratio: float | None  # 4–5★ oranı (0–1)
    monthly_series: list[MonthlyPoint]  # "YYYY-MM" artan sırada
    recent_90d: RecentWindow
    responded_count: int
    unanswered_count: int
    response_rate: float | None  # responded / total (0–1)
    service_ratings: dict[str, float]  # hizmet adı -> ortalama; veri yoksa {}
    scope: Scope | None
    score: float | None  # 0–100, 2 hane
    score_used_fallback: bool


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------


def _read(obj: Any, key: str, default: Any = None) -> Any:
    """Config/nesne/sözlükten alan okur (testler hafif sahte config verebilir)."""
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _weights(config: Any) -> tuple[float, float, float]:
    scoring = _read(config, "scoring")
    weights = _read(scoring, "weights") if scoring is not None else None
    if weights is None:
        return DEFAULT_WEIGHTS
    w1 = float(_read(weights, "average", DEFAULT_WEIGHTS[0]))
    w2 = float(_read(weights, "positive_ratio", DEFAULT_WEIGHTS[1]))
    w3 = float(_read(weights, "recent", DEFAULT_WEIGHTS[2]))
    return w1, w2, w3


def _mean(values: Iterable[float]) -> float | None:
    items = list(values)
    if not items:
        return None
    return sum(items) / len(items)


def _round1(value: float | None) -> float | None:
    return None if value is None else round(value + 0.0, 1)


def _round4(value: float | None) -> float | None:
    return None if value is None else round(value + 0.0, 4)


def _score_components(
    reviews: list[Review],
    today: datetime.date,
    weights: tuple[float, float, float],
) -> tuple[float | None, bool]:
    """(skor, fallback_kullanıldı). Ham değerlerle hesaplanır, sonra yuvarlanır."""
    if not reviews:
        return None, False

    w1, w2, w3 = weights
    average = _mean(r.stars for r in reviews)
    assert average is not None  # reviews boş değil
    positive = sum(1 for r in reviews if r.stars >= 4.0) / len(reviews)

    cutoff = today - datetime.timedelta(days=RECENT_WINDOW_DAYS)
    recent_values = [
        r.stars for r in reviews if r.date is not None and r.date > cutoff
    ]
    fallback = not recent_values
    recent_average = average if fallback else _mean(recent_values)
    assert recent_average is not None

    raw = 100.0 * (
        w1 * (average / 5.0)
        + w2 * positive
        + w3 * (recent_average / 5.0)
    )
    return round(raw, 2), fallback


# ---------------------------------------------------------------------------
# Ana fonksiyon
# ---------------------------------------------------------------------------


def compute_metrics(
    place: Place,
    reviews: list[Review],
    config: Any,
    today: datetime.date | None = None,
) -> Metrics:
    """``Place`` + ``Review`` listesinden deterministik metrikler.

    Args:
        place: Mekan künyesi (şu an doğrudan metrik üretmez; imza sözleşmesi).
        reviews: Normalize edilmiş yorumlar.
        config: ``config.scoring.weights`` taşıyan nesne/sözlük.
        today: "Son 90 gün" referansı; ``None`` ise bugün.
    """
    del place  # metrikler yalnızca yorumlardan; imza ileride genişlemeye açık
    report_date = today or datetime.date.today()

    total = len(reviews)

    distribution = {str(star): 0 for star in range(1, 6)}
    for review in reviews:
        bucket = int(round(review.stars))
        bucket = max(1, min(5, bucket))
        distribution[str(bucket)] += 1

    average = _mean(r.stars for r in reviews)

    positive_count = sum(1 for r in reviews if r.stars >= 4.0)
    positive_ratio = (positive_count / total) if total else None

    # Aylık seri: yalnızca tarihi olan yorumlar.
    monthly: dict[str, list[float]] = defaultdict(list)
    for review in reviews:
        if review.date is None:
            continue
        monthly[review.date.strftime("%Y-%m")].append(review.stars)

    monthly_series = [
        MonthlyPoint(
            month=month,
            count=len(values),
            average=round(sum(values) / len(values), 1),
        )
        for month, values in sorted(monthly.items())
    ]

    # Son 90 gün penceresi: bugünden 90 gün geriye, bugün hariç değil dahil.
    cutoff = report_date - datetime.timedelta(days=RECENT_WINDOW_DAYS)
    recent_values = [
        r.stars for r in reviews if r.date is not None and r.date > cutoff
    ]
    recent_90d = RecentWindow(
        count=len(recent_values),
        avg=_round1(_mean(recent_values)),
    )

    responded = sum(1 for r in reviews if r.answered)
    response_rate = (responded / total) if total else None

    # Hizmet bazlı ortalamalar: anahtar sırası deterministik (alfabetik).
    service_values: dict[str, list[float]] = defaultdict(list)
    for review in reviews:
        for name, value in review.detailed_ratings.items():
            service_values[str(name)].append(float(value))
    service_ratings = {
        name: round(sum(values) / len(values), 1)
        for name, values in sorted(service_values.items())
    }

    dated = [r.date for r in reviews if r.date is not None]
    scope = (
        Scope(start_date=min(dated), end_date=max(dated)) if dated else None
    )

    score, used_fallback = _score_components(
        reviews, report_date, _weights(config)
    )

    return Metrics(
        total_reviews=total,
        star_distribution=distribution,
        average_stars=_round1(average),
        positive_ratio=_round4(positive_ratio),
        monthly_series=monthly_series,
        recent_90d=recent_90d,
        responded_count=responded,
        unanswered_count=total - responded,
        response_rate=_round4(response_rate),
        service_ratings=service_ratings,
        scope=scope,
        score=score,
        score_used_fallback=used_fallback,
    )
