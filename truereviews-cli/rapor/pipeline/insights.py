"""A2 adımı — koddan gelen verdict/trend/anomali/yanıt cümleleri (plan §5-A2).

Model yok. Cümleler sabit şablonlar + ``Metrics`` içindeki hazır sayılardan
kurulur; bu modül yeni sayı **hesaplamaz**, yalnızca biçimlendirir. Aynı girdi
birebir aynı ``Insights`` çıktısını verir.

Sinyaller yalnızca üç tanedir: trend düşüşü, anomali aylar, yanıt boşluğu.
Gün/saat iddiası üretilmez. Metinler ``lang`` ("tr"/"en") ile seçilir; sayılar
TR'de virgüllü ondalık ("0,4"), EN'de noktalı ("0.4") biçimlenir.
"""

from __future__ import annotations

from typing import Any, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field

from rapor.pipeline.metrics import Metrics

__all__ = [
    "Insights",
    "compute_insights",
    "format_month_label",
]

DEFAULT_ANOMALY_THRESHOLD = 4.0
TREND_DROP_THRESHOLD = 0.3
RESPONSE_GAP_THRESHOLD = 0.5

Signal = Literal["trend", "anomaly", "response_gap"]

_TR_MONTHS = (
    "Oca", "Şub", "Mar", "Nis", "May", "Haz",
    "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
)
_EN_MONTHS = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

# Bant makine adı -> rapor etiketi. TR'de config etiketi önceliklidir.
_EN_BAND_LABELS: dict[str, str] = {
    "zayif": "Weak",
    "orta": "Fair",
    "iyi": "Good",
    "cok_iyi": "Very good",
}

_BAND_BASE: dict[str, dict[str, str]] = {
    "tr": {
        "zayif": "müşteriler memnun değil",
        "orta": "müşteri deneyimi karışık",
        "iyi": "müşteriler genel olarak memnun",
        "cok_iyi": "müşteriler büyük ölçüde memnun",
    },
    "en": {
        "zayif": "customers are not satisfied",
        "orta": "customer experience is mixed",
        "iyi": "customers are generally satisfied",
        "cok_iyi": "customers are highly satisfied",
    },
}


class Insights(BaseModel):
    """Rapor diline göre hazır metinler. ``None`` = bölüm/cümle yok."""

    model_config = ConfigDict(extra="ignore")

    band_label: str
    verdict: str
    signal: Signal | None = None
    trend: str | None = None
    fallback_note: str | None = None  # skor fallback'i kullanıldıysa tek cümle
    anomaly: str | None = None
    anomaly_months: list[str] = Field(default_factory=list)
    response_gap: str | None = None
    response_section_visible: bool = True


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------


def _read(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _lang(lang: str) -> str:
    value = (lang or "tr").strip().lower()
    return "en" if value == "en" else "tr"


def _number(value: float, lang: str) -> str:
    text = f"{value:.1f}"
    return text.replace(".", ",") if lang == "tr" else text


def _threshold(config: Any) -> float:
    """Anomali eşiği: config.anomaly_threshold / config.insights... / 4.0."""
    direct = _read(config, "anomaly_threshold")
    if direct is not None:
        try:
            return float(direct)
        except (TypeError, ValueError):
            pass
    nested = _read(_read(config, "insights"), "anomaly_threshold")
    if nested is not None:
        try:
            return float(nested)
        except (TypeError, ValueError):
            pass
    return DEFAULT_ANOMALY_THRESHOLD


def format_month_label(month: str, lang: str = "tr") -> str:
    """``"2026-11"`` -> ``"Kas 2026"`` (TR) / ``"Nov 2026"`` (EN)."""
    try:
        year_text, month_text = month.split("-", 1)
        index = int(month_text) - 1
    except (ValueError, AttributeError):
        return month
    names = _EN_MONTHS if _lang(lang) == "en" else _TR_MONTHS
    if not 0 <= index < 12:
        return month
    return f"{names[index]} {year_text}"


def _band(
    config: Any, score: float | None, lang: str
) -> tuple[str, str, str]:
    """(makine adı, rapor etiketi, taban cümle) döndürür."""
    if score is None or config is None:
        return "", "", ""
    band = config.band_for(score) if hasattr(config, "band_for") else None
    name = str(_read(band, "name", "")) if band is not None else ""
    label = str(_read(band, "label", "")) if band is not None else ""
    if lang == "en":
        label = _EN_BAND_LABELS.get(name, label)
    return name, label, _BAND_BASE[lang].get(name, "")


def _percent(rate: float, lang: str) -> str:
    pct = int(round(rate * 100))
    return f"%{pct}" if lang == "tr" else f"{pct}%"


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text else text


def _trend_sentence(
    metrics: Metrics, lang: str
) -> tuple[str | None, str | None]:
    """(tam cümle, verdict için kısa yan cümle)."""
    recent = metrics.recent_90d.avg
    average = metrics.average_stars
    if recent is None or average is None or metrics.recent_90d.count == 0:
        return None, None
    drop = average - recent
    if drop < TREND_DROP_THRESHOLD - 1e-9:
        return None, None
    value = _number(round(drop, 1), lang)
    if lang == "tr":
        return (
            f"Son 3 ayda ortalama puan {value} yıldız geriledi.",
            f"son 3 ayda ortalama puan {value} yıldız geriledi",
        )
    return (
        f"The average rating fell by {value} stars in the last 3 months.",
        f"the average rating fell by {value} stars in the last 3 months",
    )


def _anomaly_sentence(
    metrics: Metrics, config: Any, lang: str
) -> tuple[str | None, list[str], str | None]:
    """(tam cümle, ay etiketleri, verdict için kısa yan cümle)."""
    threshold = _threshold(config)
    months = [
        point.month
        for point in metrics.monthly_series
        if point.average < threshold
    ]
    if not months:
        return None, [], None
    labels = [format_month_label(month, lang) for month in months]
    joined = ", ".join(labels)
    count = len(months)
    value = _number(threshold, lang)
    if lang == "tr":
        sentence = (
            f"Kırmızı noktalar: {joined} — ortalama puanın {value}'ın "
            f"altına indiği {count} ay."
        )
        clause = f"{count} ayda ortalama puan {value}'ın altına indi"
    else:
        sentence = (
            f"Red points: {joined} — {count} "
            f"{'month' if count == 1 else 'months'} where the average "
            f"rating fell below {value}."
        )
        clause = (
            f"the average rating fell below {value} in {count} "
            f"{'month' if count == 1 else 'months'}"
        )
    return sentence, labels, clause


def _response_sentence(
    metrics: Metrics, lang: str
) -> tuple[str | None, bool, str | None]:
    """(cümle, bölüm görünür mü, verdict yan cümlesi)."""
    rate = metrics.response_rate
    if rate is None:
        return None, False, None
    if rate >= 1.0:
        return None, False, None
    if rate >= RESPONSE_GAP_THRESHOLD:
        # %50–%99: bölüm görünür, boşluk cümlesi yok.
        return None, True, None
    percent = _percent(rate, lang)
    unanswered = metrics.unanswered_count
    if lang == "tr":
        sentence = (
            f"Yorumların yanıtlanma oranı {percent}; "
            f"{unanswered} yorum yanıt bekliyor."
        )
        clause = f"yorumların yanıtlanma oranı {percent}"
    else:
        sentence = (
            f"Only {percent} of reviews have a reply; "
            f"{unanswered} reviews are waiting for an answer."
        )
        clause = f"only {percent} of reviews have a reply"
    return sentence, True, clause


def _fallback_note(metrics: Metrics, lang: str) -> str | None:
    if not metrics.score_used_fallback:
        return None
    if lang == "tr":
        return (
            "Son 90 günde yorum yok; skor genel ortalamayla hesaplandı."
        )
    return (
        "There are no reviews in the last 90 days; the score uses the "
        "overall average."
    )


# ---------------------------------------------------------------------------
# Ana fonksiyon
# ---------------------------------------------------------------------------


def compute_insights(
    metrics: Metrics,
    reviews: list[Any] | None = None,
    config: Any = None,
    lang: str = "tr",
    today: Any = None,
) -> Insights:
    """``Metrics`` + config + dil -> hazır cümleler.

    Args:
        metrics: A adımı çıktısı; tüm sayılar buradan gelir.
        reviews: API uyumu için; cümle üretiminde kullanılmaz.
        config: Bantlar (``band_for``) ve isteğe bağlı ``anomaly_threshold``.
        lang: "tr" veya "en".
        today: API uyumu için; metinler rapor tarihine bağlı değildir.
    """
    del reviews, today
    language = _lang(lang)

    if config is None:
        label, base = "", ""
    else:
        _, label, base = _band(config, metrics.score, language)

    trend, trend_clause = _trend_sentence(metrics, language)
    anomaly, anomaly_months, anomaly_clause = _anomaly_sentence(
        metrics, config, language
    )
    response_gap, response_visible, response_clause = _response_sentence(
        metrics, language
    )

    signal: Signal | None = None
    signal_clause: str | None = None
    if trend_clause is not None:
        signal, signal_clause = "trend", trend_clause
    elif anomaly_clause is not None:
        signal, signal_clause = "anomaly", anomaly_clause
    elif response_clause is not None:
        signal, signal_clause = "response_gap", response_clause

    if label and base:
        verdict = f"{label} — {base}"
        if signal_clause is not None:
            verdict += f"; {_lower_first(signal_clause)}"
        verdict += "."
    else:
        verdict = ""

    return Insights(
        band_label=label,
        verdict=verdict,
        signal=signal,
        trend=trend,
        fallback_note=_fallback_note(metrics, language),
        anomaly=anomaly,
        anomaly_months=anomaly_months,
        response_gap=response_gap,
        response_section_visible=response_visible,
    )
