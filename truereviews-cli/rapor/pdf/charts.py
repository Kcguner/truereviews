"""Grafikler — plan §6 (reportlab.graphics, harici görsel yok).

Üç fonksiyon da sabit boyutlu bir ``Drawing`` (Flowable) döndürür. Tüm
koordinatlar verilen ``width``/``height`` içinde kalır; etiketler taşmaz.
Renkler ``theme.PALETTE``ten, fontlar ``theme.FONTS``tan gelir. Rastgelelik
yoktur: aynı girdi aynı şekil listesini üretir.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping

from reportlab.graphics.shapes import Circle, Drawing, Line, PolyLine, Rect, String
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth

from rapor.pdf.theme import FONTS, PALETTE, register_fonts

__all__ = [
    "monthly_line_chart",
    "star_distribution_chart",
    "service_ratings_chart",
]

_TR_MONTHS = (
    "Oca", "Şub", "Mar", "Nis", "May", "Haz",
    "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
)
_EN_MONTHS = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

_BODY_SIZE = 7.0


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------


def _read(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _lang(lang: str) -> str:
    return "en" if (lang or "tr").strip().lower() == "en" else "tr"


def _month_label(month: str, lang: str) -> str:
    """``"2026-11"`` -> ``"Kas"`` / ``"Nov"``; bozuk değerde metin aynen."""
    try:
        _, month_text = month.split("-", 1)
        index = int(month_text) - 1
    except (ValueError, AttributeError):
        return str(month)
    names = _EN_MONTHS if _lang(lang) == "en" else _TR_MONTHS
    return names[index] if 0 <= index < 12 else str(month)


def _number(value: float, lang: str) -> str:
    text = f"{value:.1f}"
    return text.replace(".", ",") if _lang(lang) == "tr" else text


def _fit(text: str, max_width: float, font_size: float = _BODY_SIZE) -> str:
    """Metni verilen genişliğe sığdır; gerekirse ``…`` ile kısalt."""
    if stringWidth(text, FONTS["body"], font_size) <= max_width:
        return text
    ellipsis = "…"
    while text and stringWidth(
        text + ellipsis, FONTS["body"], font_size
    ) > max_width:
        text = text[:-1]
    return (text + ellipsis) if text else ellipsis


def _hex(name: str) -> HexColor:
    return HexColor(PALETTE[name])


# ---------------------------------------------------------------------------
# 1 — Aylık ortalama çizgi grafiği
# ---------------------------------------------------------------------------


def monthly_line_chart(
    monthly_series: Iterable[Any],
    anomaly_months: list[str] | None,
    lang: str = "tr",
    width: float = 300,
    height: float = 110,
    threshold: float = 4.0,
) -> Drawing | None:
    """Aylık ortalama çizgisi; eşik altı aylar kırmızı nokta.

    ``monthly_series`` boşsa ``None`` döner (bölüm gizlenir). X etiketleri
    ay sayısına göre seyreltilir (en çok ~8 etiket). Nokta etiketi yoktur;
    anomali cümlesi rapor metninde durur.

    ``anomaly_months`` = "YYYY-MM" listesi. Verilirse yalnızca o aylar kırmızı
    olur (boş liste = kırmızı yok); ``None`` ise eşik altı aylar kırmızı olur.
    """
    register_fonts()

    points = [p for p in (monthly_series or []) if p is not None]
    if not points:
        return None

    drawing = Drawing(width, height)
    left, right, top, bottom = 20.0, 8.0, 8.0, 16.0
    plot_w = max(1.0, width - left - right)
    plot_h = max(1.0, height - top - bottom)

    values = [float(_read(p, "average", 0.0) or 0.0) for p in points]
    months = [str(_read(p, "month", "")) for p in points]

    # Akıllı Y ekseni: düşük ortalamalar varsa 1–5, yoksa 3–5.
    y_min = 1.0 if min(values) < 3.0 else 3.0
    y_max = 5.0
    span = y_max - y_min

    def y_pos(value: float) -> float:
        clipped = min(y_max, max(y_min, value))
        return bottom + (clipped - y_min) / span * plot_h

    count = len(points)
    if count == 1:
        xs = [left + plot_w / 2.0]
    else:
        step = plot_w / (count - 1)
        xs = [left + i * step for i in range(count)]

    # Eksenler ve ızgara.
    line_color = _hex("line")
    drawing.add(
        Line(left, bottom, left, bottom + plot_h,
             strokeColor=line_color, strokeWidth=0.5)
    )
    drawing.add(
        Line(left, bottom, left + plot_w, bottom,
             strokeColor=line_color, strokeWidth=0.5)
    )

    ticks = [1.0, 2.0, 3.0, 4.0, 5.0] if y_min == 1.0 else [3.0, 4.0, 5.0]
    for tick in ticks:
        y = y_pos(tick)
        drawing.add(
            Line(left, y, left + plot_w, y,
                 strokeColor=line_color, strokeWidth=0.4)
        )
        drawing.add(
            String(left - 3.0, y - 2.0, f"{tick:g}",
                   fontName=FONTS["body"], fontSize=_BODY_SIZE,
                   fillColor=_hex("ink"), textAnchor="end")
        )

    # Çizgi.
    if count > 1:
        coords: list[float] = []
        for x, value in zip(xs, values):
            coords.extend([x, y_pos(value)])
        drawing.add(
            PolyLine(coords, strokeColor=_hex("primary"), strokeWidth=1.2)
        )

    anomaly_set = None if anomaly_months is None else set(anomaly_months)
    primary = _hex("primary")
    complaint = _hex("complaint")
    paper = _hex("paper")
    for x, value, month in zip(xs, values, months):
        y = y_pos(value)
        is_anomaly = value < threshold if anomaly_set is None else month in anomaly_set
        if is_anomaly:
            drawing.add(
                Circle(x, y, 2.6, fillColor=complaint,
                       strokeColor=paper, strokeWidth=0.6)
            )
        else:
            drawing.add(
                Circle(x, y, 1.6, fillColor=primary, strokeColor=None)
            )

    # X etiketleri: seyreltme + sığdırma.
    if count <= 8:
        label_step = 1
    elif count <= 16:
        label_step = 2
    else:
        label_step = 3
    slot = plot_w / max(1, count - 1) if count > 1 else plot_w
    max_label = max(10.0, slot * label_step - 1.0)
    for index in range(0, count, label_step):
        label = _month_label(months[index], lang)
        drawing.add(
            String(xs[index], bottom - 8.0, _fit(label, max_label),
                   fontName=FONTS["body"], fontSize=_BODY_SIZE,
                   fillColor=_hex("ink"), textAnchor="middle")
        )

    return drawing


# ---------------------------------------------------------------------------
# 2 — Puan dağılımı (5 → 1)
# ---------------------------------------------------------------------------


def star_distribution_chart(
    star_distribution: dict,
    lang: str = "tr",
    width: float = 140,
    height: float = 90,
) -> Drawing | None:
    """Yatay çubuklar 5→1; sağda sayı. 4–5★ primary, 3 nötr, 1–2★ complaint."""
    register_fonts()

    distribution = star_distribution or {}
    counts = {
        star: int(_read(distribution, str(star), 0) or 0)
        for star in range(1, 6)
    }
    maximum = max(counts.values(), default=0)

    drawing = Drawing(width, height)
    top, bottom = 4.0, 4.0
    row_h = (height - top - bottom) / 5.0
    bar_h = min(7.0, max(3.0, row_h - 4.0))

    label_w = 16.0
    value_w = 18.0
    bar_x = label_w
    bar_max = max(1.0, width - bar_x - value_w)

    primary = _hex("primary")
    complaint = _hex("complaint")
    neutral = HexColor(PALETTE["ink"]).clone(alpha=0.55)
    ink = _hex("ink")

    for row, star in enumerate(range(5, 0, -1)):
        value = counts[star]
        y = height - top - (row + 1) * row_h + (row_h - bar_h) / 2.0
        drawing.add(
            String(1.0, y + bar_h / 2.0 - 2.5, f"{star}★",
                   fontName=FONTS["body"], fontSize=_BODY_SIZE,
                   fillColor=ink)
        )
        if maximum > 0 and value > 0:
            bar_w = bar_max * value / maximum
            if star >= 4:
                color = primary
            elif star == 3:
                color = neutral
            else:
                color = complaint
            drawing.add(
                Rect(bar_x, y, bar_w, bar_h, fillColor=color, strokeColor=None)
            )
        drawing.add(
            String(width - 1.0, y + bar_h / 2.0 - 2.5, str(value),
                   fontName=FONTS["body"], fontSize=_BODY_SIZE,
                   fillColor=ink, textAnchor="end")
        )

    return drawing


# ---------------------------------------------------------------------------
# 3 — Hizmet bazlı puanlar
# ---------------------------------------------------------------------------


def service_ratings_chart(
    service_ratings: dict[str, float],
    lang: str = "tr",
    width: float = 140,
    height: float = 90,
) -> Drawing | None:
    """Hizmet adı + 1–5 çubuğu + ortalama; en yüksek ortalama önce."""
    register_fonts()

    ratings = dict(service_ratings or {})
    if not ratings:
        return None

    # Deterministik sıra: değer azalan, eşitlikte ad alfabetik.
    ordered = sorted(
        ((str(name), float(value)) for name, value in ratings.items()),
        key=lambda item: (-item[1], item[0]),
    )

    drawing = Drawing(width, height)
    top, bottom = 4.0, 4.0
    row_h = (height - top - bottom) / len(ordered)
    font_size = _BODY_SIZE if row_h >= 9.0 else max(5.0, row_h - 2.0)
    bar_h = min(6.0, max(2.5, row_h - 4.0))

    label_w = 52.0 if width >= 120 else width * 0.38
    value_w = 18.0
    bar_x = label_w
    bar_max = max(1.0, width - bar_x - value_w)

    primary = _hex("primary")
    ink = _hex("ink")

    for row, (name, value) in enumerate(ordered):
        y = height - top - (row + 1) * row_h + (row_h - bar_h) / 2.0
        drawing.add(
            String(1.0, y + bar_h / 2.0 - font_size / 2.5,
                   _fit(name, label_w - 3.0, font_size),
                   fontName=FONTS["body"], fontSize=font_size,
                   fillColor=ink)
        )
        span = max(0.0, min(5.0, value)) / 5.0
        if span > 0:
            drawing.add(
                Rect(bar_x, y, bar_max * span, bar_h,
                     fillColor=primary, strokeColor=None)
            )
        drawing.add(
            String(width - 1.0, y + bar_h / 2.0 - font_size / 2.5,
                   _number(value, lang),
                   fontName=FONTS["body"], fontSize=font_size,
                   fillColor=ink, textAnchor="end")
        )

    return drawing
