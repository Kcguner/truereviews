"""`rapor.pdf.charts` testleri — plan §6, §9 (grafikler).

Grafikler `cok` fixture'ının gerçek metrikleriyle üretilir. Testler render
etmez; `Drawing` şekil ağacı taranır (renk, konum, metin) ve iki çizimin
şekil listesi birebir karşılaştırılır (determinizm).
"""

from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path

import pytest
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import Color, HexColor

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rapor.normalize import normalize  # noqa: E402
from rapor.pipeline.metrics import MonthlyPoint, compute_metrics  # noqa: E402
from rapor.pdf.charts import (  # noqa: E402
    monthly_line_chart,
    service_ratings_chart,
    star_distribution_chart,
)
from rapor.pdf.theme import PALETTE  # noqa: E402

TODAY = datetime.date(2026, 11, 14)


def _metrics():
    data = json.loads((ROOT / "fixtures" / "cok.json").read_text(encoding="utf-8"))
    normalized = normalize(data)
    return compute_metrics(
        normalized.place, normalized.reviews, None, today=TODAY
    )


def _walk(shape):
    """Şekil ağacını derinlemesine gezer."""
    yield shape
    for child in getattr(shape, "contents", None) or []:
        yield from _walk(child)


def _strings(drawing: Drawing) -> list[str]:
    return [s.text for s in _walk(drawing) if type(s).__name__ == "String"]


def _hex_colors(drawing: Drawing) -> set[str]:
    colors: set[str] = set()
    for shape in _walk(drawing):
        for attr in ("fillColor", "strokeColor"):
            color = getattr(shape, attr, None)
            if isinstance(color, Color):
                colors.add(color.hexval())
    return colors


def _snapshot(drawing: Drawing) -> list[tuple[str, int, tuple]]:
    """Karşılaştırılabilir şekil listesi (kimlik/nesne adı yok)."""

    def value_of(value):
        if isinstance(value, Color):
            return value.hexval()
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        if isinstance(value, (list, tuple)) and all(
            isinstance(item, (int, float)) for item in value
        ):
            return tuple(value)
        return repr(value)

    result: list[tuple[str, int, tuple]] = []

    def visit(shape, depth: int):
        attrs = tuple(
            sorted(
                (key, value_of(value))
                for key, value in shape.__dict__.items()
                if not key.startswith("_") and key != "contents"
            )
        )
        result.append((type(shape).__name__, depth, attrs))
        for child in getattr(shape, "contents", None) or []:
            visit(child, depth + 1)

    visit(drawing, 0)
    return result


def _anomaly_months(metrics) -> list[str]:
    return [p.month for p in metrics.monthly_series if p.average < 4.0]


# ---------------------------------------------------------------------------
# Üç çizim
# ---------------------------------------------------------------------------


def test_three_drawings_from_cok_fixture():
    metrics = _metrics()

    monthly = monthly_line_chart(
        metrics.monthly_series, _anomaly_months(metrics), width=300, height=110
    )
    stars = star_distribution_chart(
        metrics.star_distribution, width=140, height=90
    )
    services = service_ratings_chart(
        metrics.service_ratings, width=140, height=90
    )

    for drawing in (monthly, stars, services):
        assert isinstance(drawing, Drawing)
    assert (monthly.width, monthly.height) == (300, 110)
    assert (stars.width, stars.height) == (140, 90)
    assert (services.width, services.height) == (140, 90)


def test_monthly_has_one_point_per_month():
    metrics = _metrics()
    drawing = monthly_line_chart(metrics.monthly_series, [])
    circles = [s for s in _walk(drawing) if type(s).__name__ == "Circle"]
    assert len(circles) == len(metrics.monthly_series)


# ---------------------------------------------------------------------------
# Anomali noktaları
# ---------------------------------------------------------------------------


def test_anomaly_months_become_red_points():
    metrics = _metrics()
    anomalies = _anomaly_months(metrics)
    assert anomalies  # cok fixture'ında eşik altı aylar var

    drawing = monthly_line_chart(metrics.monthly_series, anomalies)
    complaint = HexColor(PALETTE["complaint"]).hexval()
    red_circles = [
        s
        for s in _walk(drawing)
        if type(s).__name__ == "Circle"
        and isinstance(s.fillColor, Color)
        and s.fillColor.hexval() == complaint
    ]
    assert len(red_circles) == len(anomalies)


def test_empty_anomaly_list_has_no_red():
    metrics = _metrics()
    assert _anomaly_months(metrics)

    drawing = monthly_line_chart(metrics.monthly_series, [])
    complaint = HexColor(PALETTE["complaint"]).hexval()
    assert complaint not in _hex_colors(drawing)


def test_threshold_anomalies_when_list_is_none():
    series = [
        MonthlyPoint(month="2026-01", count=3, average=4.6),
        MonthlyPoint(month="2026-02", count=4, average=3.2),
    ]
    drawing = monthly_line_chart(series, None)
    complaint = HexColor(PALETTE["complaint"]).hexval()
    red = [
        s
        for s in _walk(drawing)
        if type(s).__name__ == "Circle"
        and isinstance(s.fillColor, Color)
        and s.fillColor.hexval() == complaint
    ]
    assert len(red) == 1


# ---------------------------------------------------------------------------
# Boş / sıfır girdiler
# ---------------------------------------------------------------------------


def test_empty_monthly_series_returns_none():
    assert monthly_line_chart([], []) is None


def test_empty_service_ratings_returns_none():
    assert service_ratings_chart({}) is None


def test_zero_star_distribution_is_fine():
    drawing = star_distribution_chart(
        {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}, width=140, height=90
    )
    assert isinstance(drawing, Drawing)
    assert (drawing.width, drawing.height) == (140, 90)
    assert "0" in _strings(drawing)
    # Sıfır sayılarda hiç çubuk çizilmez.
    assert not [s for s in _walk(drawing) if type(s).__name__ == "Rect"]


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


def test_same_input_same_shapes():
    metrics = _metrics()
    anomalies = _anomaly_months(metrics)

    first = monthly_line_chart(metrics.monthly_series, anomalies)
    second = monthly_line_chart(metrics.monthly_series, anomalies)
    assert _snapshot(first) == _snapshot(second)

    first = star_distribution_chart(metrics.star_distribution)
    second = star_distribution_chart(metrics.star_distribution)
    assert _snapshot(first) == _snapshot(second)

    first = service_ratings_chart(metrics.service_ratings)
    second = service_ratings_chart(metrics.service_ratings)
    assert _snapshot(first) == _snapshot(second)


# ---------------------------------------------------------------------------
# Etiketler ve taşma
# ---------------------------------------------------------------------------


def test_turkish_service_labels():
    drawing = service_ratings_chart({"Yemek": 4.6, "Servis hızı": 3.4})
    labels = _strings(drawing)
    assert "Yemek" in labels
    assert "Servis hızı" in labels
    # En yüksek ortalama önce: Yemek çubuğu Servis hızı çubuğundan uzun.
    rects = [s for s in _walk(drawing) if type(s).__name__ == "Rect"]
    assert len(rects) == 2
    assert rects[0].width > rects[1].width


def test_many_months_sparse_labels_no_overflow():
    series = [
        MonthlyPoint(month=f"2025-{m:02d}", count=2, average=4.2)
        for m in range(1, 13)
    ] + [
        MonthlyPoint(month=f"2026-{m:02d}", count=2, average=4.2)
        for m in range(1, 7)
    ]
    drawing = monthly_line_chart(series, [], width=300, height=110)
    assert isinstance(drawing, Drawing)

    month_names = {
        "Oca", "Şub", "Mar", "Nis", "May", "Haz",
        "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
    }
    tick_labels = [t for t in _strings(drawing) if t in month_names]
    assert 0 < len(tick_labels) <= 8

    # Tüm şekiller tuval içinde kalır.
    for shape in _walk(drawing):
        if hasattr(shape, "x"):
            assert 0 <= shape.x <= 300
        if hasattr(shape, "y"):
            assert 0 <= shape.y <= 110
