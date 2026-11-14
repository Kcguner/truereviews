"""Rapor blokları — plan §6 sayfa anatomisi.

Her fonksiyon reportlab ``Flowable`` listesi döndürür. Boş veri → boş liste:
bölüm sessizce gizlenir (İlke 4). Sayfa kurulumu burada yapılmaz; ``report.py``
dönen parçaları birleştirir.

Renkler yalnızca ``theme.PALETTE``ten, metinler yalnızca ``i18n.t``den gelir.
Ölçü ve fontlar ``theme.SIZES`` / ``theme.FONTS``. Turuncu yok.

Inline vurgu ``<b>``/``<i>`` ile değil, açık ``<font face="...">`` ile yapılır:
``theme.register_fonts`` font ailesi kaydetmez, ``<b>`` sessizce normal fonta
düşer. Kullanıcı metni her zaman kaçırılır (``escape``); markup yalnızca
bileşenin kendi eklediği yerlerde vardır.
"""

from __future__ import annotations

import datetime
from typing import Any, Callable, Mapping, Sequence
from xml.sax.saxutils import escape

from reportlab.lib import pagesizes
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    KeepTogether,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from rapor.pdf.i18n import fmt_num, month_label, t
from rapor.pdf.theme import FONTS, PALETTE, SIZES, register_fonts, styles

__all__ = [
    "shorten_quote",
    "header_line",
    "title_block",
    "stat_boxes",
    "section_heading",
    "overview_block",
    "topic_row",
    "products_line",
    "instagram_box",
    "complaint_card",
    "unanswered_table",
    "single_step_box",
    "method_note",
    "closing_line",
    "footer_line",
    "draw_footer",
    "footer_callback",
    "draw_watermark",
    "demo_watermark",
]

# Metin kaçırma kısayolları; boşluklar tek boşluğa indirilir.
_LENGTH_UNITS: dict[str, float] = {
    "mm": mm,
    "cm": 10.0 * mm,
    "in": 72.0,
    "pt": 1.0,
}


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------


def _read(obj: Any, key: str, default: Any = None) -> Any:
    """Nesne ya da sözlükten alan okur (TopicCluster ve sahte veri aynı yol)."""
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _color(name: str) -> HexColor:
    return HexColor(PALETTE[name])


def _length(value: Any) -> float:
    """``"18mm"`` / ``"18 mm"`` / sayı -> punto."""
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().lower()
    for suffix, factor in _LENGTH_UNITS.items():
        if text.endswith(suffix):
            try:
                return float(text[: -len(suffix)].strip()) * factor
            except ValueError:
                break
    return float(text)


def _content_width() -> float:
    """A4 genişliği eksi iki kenar (punto)."""
    page = getattr(pagesizes, str(SIZES["page"]).upper(), pagesizes.A4)
    return float(page[0]) - 2.0 * _length(SIZES["margin"])


def _text(value: Any) -> str:
    """Kaçırılmış, tek boşluklu metin. ``None`` → boş dize."""
    if value is None:
        return ""
    return " ".join(escape(str(value)).split())


def _bold(value: Any) -> str:
    return f'<font face="{FONTS["bold"]}">{_text(value)}</font>'


def _italic(value: Any) -> str:
    return f'<font face="{FONTS["italic"]}">{_text(value)}</font>'


def _style(parent: ParagraphStyle, **overrides: Any) -> ParagraphStyle:
    """Tema stilinin kopyası; yeni renk/font üretmeden varyant."""
    return ParagraphStyle(f"{parent.name}Variant", parent=parent, **overrides)


def _format_date(lang: str, value: Any) -> str:
    """``date`` -> ``"14 Kas 2026"``; diğer değerler metne çevrilir."""
    if isinstance(value, datetime.datetime):
        value = value.date()
    if isinstance(value, datetime.date):
        return f"{value.day} {month_label(lang, value.strftime('%Y-%m'))}"
    return str(value or "")


def shorten_quote(text: str, limit: int = 200) -> str:
    """Alıntıyı kelime sınırında kısaltır; kısaldıysa ``…`` ekler."""
    normalized = " ".join(str(text or "").split())
    if limit <= 0 or len(normalized) <= limit:
        return normalized
    cut = normalized[:limit].rstrip()
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" .,;:—-") + " …"


def _month_of(value: Any) -> str | None:
    """``date`` / ``"YYYY-MM"`` -> ``"YYYY-MM"``; okunamazsa ``None``."""
    if isinstance(value, datetime.datetime):
        value = value.date()
    if isinstance(value, datetime.date):
        return value.strftime("%Y-%m")
    text = str(value or "").strip()
    return text if len(text) >= 7 and text[4] == "-" else None


def _star_color(stars: float) -> HexColor:
    """1–2 şikayet kırmızısı, 3 nötr, 4–5 ana yeşil."""
    if stars <= 2.0:
        return _color("complaint")
    if stars < 4.0:
        return _color("watch")
    return _color("primary")


def _star_text(lang: str, stars: float) -> str:
    value = float(stars)
    digits = 0 if abs(value - round(value)) < 1e-9 else 1
    return f"{fmt_num(lang, value, digits)} ★"


def _month_span(lang: str, start: str, end: str) -> tuple[str, str]:
    """Ay aralığı etiketleri: aynı yıl → ``("Eyl", "Kas 2026")``.

    ``card_meta`` şablonu ``{start}–{end}`` yazdığı için tek tire kalır.
    Farklı yıllarda iki etiket de yıl taşır.
    """
    start_label = month_label(lang, start)
    end_label = month_label(lang, end)
    if start[:4] == end[:4]:
        return start_label.rsplit(" ", 1)[0], end_label
    return start_label, end_label


def _table(
    data: Sequence[Sequence[Any]],
    widths: Sequence[float],
    style: TableStyle,
    *,
    row_heights: Sequence[float] | None = None,
) -> Table:
    table = Table(
        list(data),
        colWidths=list(widths),
        rowHeights=list(row_heights) if row_heights else None,
        hAlign="LEFT",
    )
    table.setStyle(style)
    return table


def _no_padding() -> list[tuple[Any, ...]]:
    return [
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]


# ---------------------------------------------------------------------------
# 1–2 — Üst çizgi ve başlık
# ---------------------------------------------------------------------------


def header_line(lang: str, report_date: Any) -> list[Flowable]:
    """Sol marka, sağ rapor tarihi; altında ince çizgi."""
    register_fonts()
    base = styles()
    width = _content_width()
    brand_style = _style(base["small"], fontName=FONTS["bold"], textColor=_color("ink"))
    date_style = _style(base["small"], alignment=TA_RIGHT)

    brand = Paragraph(t(lang, "header_brand"), brand_style)
    date = Paragraph(
        t(lang, "header_date", date=_format_date(lang, report_date)), date_style
    )
    row = _table(
        [[brand, date]],
        [width * 0.5, width * 0.5],
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ]
        ),
    )
    rule = HRFlowable(
        width="100%",
        thickness=0.6,
        color=_color("line"),
        spaceBefore=4,
        spaceAfter=8,
    )
    return [row, rule]


def title_block(place_title: str, scope_text: str) -> list[Flowable]:
    """H1 mekan adı + gri küçük kapsam satırı."""
    register_fonts()
    if not place_title and not scope_text:
        return []
    base = styles()
    parts: list[Flowable] = []
    if place_title:
        parts.append(Paragraph(_text(place_title), base["h1"]))
    if scope_text:
        parts.append(Paragraph(_text(scope_text), base["small"]))
    parts.append(Spacer(1, 6))
    return [KeepTogether(parts)]


# ---------------------------------------------------------------------------
# 3 — Beş kutu
# ---------------------------------------------------------------------------


def stat_boxes(lang: str, stats: Sequence[Mapping[str, Any]]) -> list[Flowable]:
    """Beş kutu: büyük değer + BÜYÜK HARF etiket + alt açıklama.

    Girdi: ``[{"value": ..., "label_key": ..., "sub": ...}]``. Değer ve alt
    metin çağırandan hazır gelir; etiket ``label_key`` ile ``t``den okunur
    (``"label"`` verilirse o kullanılır). Eksik kutu gönderilmez.
    """
    register_fonts()
    items = [item for item in (stats or []) if item]
    if not items:
        return []

    base = styles()
    value_style = _style(
        base["body"],
        fontName=FONTS["bold"],
        fontSize=float(SIZES["stat_value"]),
        leading=float(SIZES["stat_value"]) * 1.08,
        textColor=_color("primary"),
        alignment=TA_CENTER,
    )
    label_style = _style(
        base["stat_label"], alignment=TA_CENTER, textColor=_color("watch")
    )
    sub_style = _style(base["tiny"], alignment=TA_CENTER)

    values: list[Flowable] = []
    labels: list[Flowable] = []
    subs: list[Flowable] = []
    for item in items:
        values.append(Paragraph(_text(_read(item, "value", "")), value_style))
        label = _read(item, "label")
        if not label:
            key = _read(item, "label_key")
            label = t(lang, key) if key else ""
        labels.append(Paragraph(_text(label).upper(), label_style))
        subs.append(Paragraph(_text(_read(item, "sub", "")), sub_style))

    width = _content_width() / len(items)
    table = _table(
        [values, labels, subs],
        [width] * len(items),
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LINEAFTER", (0, 0), (-2, -1), 0.5, _color("line")),
            ]
        ),
    )
    return [table, Spacer(1, 8)]


# ---------------------------------------------------------------------------
# 4 — Bölüm başlığı
# ---------------------------------------------------------------------------


def section_heading(lang: str, key: str) -> list[Flowable]:
    """``"1 · Genel görünüm"`` tarzı H2; metin ``key`` ile ``t``den."""
    register_fonts()
    return [Paragraph(_text(t(lang, key)), styles()["h2"])]


# ---------------------------------------------------------------------------
# 5 — Genel görünüm
# ---------------------------------------------------------------------------


def overview_block(
    lang: str,
    score: float | None,
    band_label: str | None,
    verdict: str | None,
    method_note: str | None,
) -> list[Flowable]:
    """Skor + bant + verdict + "Nasıl hesaplandı?" paragrafı.

    Skor yoksa blok yok (``[]``): uydurma değer basılmaz. Çift kolon düzenini
    çağıran kurar; burada yalnızca sol kolon içeriği üretilir.
    """
    register_fonts()
    if score is None:
        return []

    base = styles()
    value = float(score)
    digits = 0 if abs(value - round(value)) < 1e-9 else 1
    score_text = (
        f"{fmt_num(lang, value, digits)}"
        f'<font size="11">/100</font>'
    )

    parts: list[Flowable] = [Paragraph(score_text, base["score_big"])]
    if band_label:
        parts.append(
            Paragraph(
                _text(band_label),
                _style(
                    base["body"],
                    fontName=FONTS["bold"],
                    textColor=_color("primary"),
                    spaceBefore=2,
                ),
            )
        )
    if verdict:
        parts.append(Paragraph(_text(verdict), base["body"]))
    if method_note:
        parts.append(
            Paragraph(
                _text(t(lang, "how_calculated")),
                _style(
                    base["small"],
                    fontName=FONTS["bold"],
                    textColor=_color("ink"),
                    spaceBefore=6,
                ),
            )
        )
        parts.append(Paragraph(_text(method_note), base["small"]))
    return [KeepTogether(parts)]


# ---------------------------------------------------------------------------
# 6 — Övgü konusu
# ---------------------------------------------------------------------------


def _topic_quote(topic: Any) -> str:
    """Konunun kanıt yorumlarından tek alıntı (deterministik: ilk yeterli)."""
    evidence = _read(topic, "evidence_reviews", []) or []
    fallback = ""
    for review in evidence:
        text = " ".join(str(_read(review, "text", "") or "").split())
        if not fallback and text:
            fallback = text
        if len(text) >= 20:
            return text
    return fallback


def topic_row(lang: str, topic: Any, max_count: int) -> list[Flowable]:
    """Konu adı + yorum sayısı + oransal çubuk + tek alıntı."""
    register_fonts()
    if topic is None:
        return []

    name = str(_read(topic, "name", "") or "")
    if not name:
        return []
    count = int(_read(topic, "review_count", 0) or 0)

    base = styles()
    width = _content_width()
    header = _table(
        [
            [
                Paragraph(_bold(name), base["body"]),
                Paragraph(
                    _text(t(lang, "topic_review_count", n=count)),
                    _style(base["small"], alignment=TA_RIGHT),
                ),
            ]
        ],
        [width * 0.7, width * 0.3],
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ]
        ),
    )

    ratio = 0.0
    if max_count and float(max_count) > 0:
        ratio = max(0.0, min(1.0, count / float(max_count)))
    filled = width * ratio
    # Sıfır genişlik reportlab'da boş hücre sayılmaz; iz bırak.
    filled = max(filled, 0.01) if ratio > 0 else 0.01
    bar = _table(
        [["", ""]],
        [filled, max(width - filled, 0.01)],
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), _color("primary")),
                ("BACKGROUND", (1, 0), (1, 0), _color("line")),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        ),
        row_heights=[4],
    )

    parts: list[Flowable] = [header, Spacer(1, 3), bar, Spacer(1, 4)]
    quote = _topic_quote(topic)
    if quote:
        parts.append(
            Paragraph(
                _italic(f"“{shorten_quote(quote)}”"),
                base["quote"],
            )
        )
        parts.append(Spacer(1, 7))
    return [KeepTogether(parts)]


# ---------------------------------------------------------------------------
# 6 — Ürünler ve Instagram
# ---------------------------------------------------------------------------


def products_line(lang: str, products: Sequence[Any]) -> list[Flowable]:
    """``"En çok övülen ürünler: a, b, c"`` tek satır; ürün yoksa boş."""
    register_fonts()
    names: list[str] = []
    for product in products or []:
        name = product if isinstance(product, str) else _read(product, "name", "")
        text = str(name or "").strip()
        if text:
            names.append(text)
    if not names:
        return []
    body = t(lang, "top_products", items=", ".join(names))
    return [Paragraph(_text(body), styles()["body"]), Spacer(1, 6)]


def instagram_box(lang: str, caption: str | None) -> list[Flowable]:
    """Yumuşak yeşil zemin kutu: küçük başlık + paylaşım metni."""
    register_fonts()
    text = " ".join(str(caption or "").split())
    if not text:
        return []
    base = styles()
    heading = _style(
        base["small"], fontName=FONTS["bold"], textColor=_color("primary")
    )
    box = _table(
        [
            [
                [
                    Paragraph(_text(t(lang, "instagram_box")), heading),
                    Spacer(1, 2),
                    Paragraph(_text(text), base["body"]),
                ]
            ]
        ],
        [_content_width()],
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _color("primary_soft")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        ),
    )
    return [box]


# ---------------------------------------------------------------------------
# 7 — Şikayet kartı
# ---------------------------------------------------------------------------


def complaint_card(
    lang: str,
    topic: Any,
    quote: str | None,
    reply_draft: str | None,
    *,
    strong: bool = True,
    summary_mode: bool = False,
) -> list[Flowable]:
    """Güçlü/izlenmeli şikayet kartı (plan §6 madde 7).

    Rozet sayısı ``review_count`` (koddan). ``summary_mode`` → alıntı + taslak
    tek satır. ``strong=False`` → gri-mavi "İZLENMELİ" rozeti, taslak yalnızca
    varsa basılır.
    """
    register_fonts()
    if topic is None:
        return []

    name = str(_read(topic, "name", "") or "")
    if not name:
        return []

    review_ids = _read(topic, "review_ids", []) or []
    count = int(_read(topic, "review_count", len(review_ids)) or len(review_ids))
    accent = _color("complaint") if strong else _color("watch")
    soft = _color("complaint_soft") if strong else _color("primary_soft")

    base = styles()
    width = _content_width()
    inner = width - 3.0  # dikey şerit payı

    badge_key = "badge_strong" if strong else "badge_watch"
    badge_text = t(lang, badge_key, n=count)
    badge = Paragraph(
        _text(badge_text),
        _style(
            base["tiny"],
            fontName=FONTS["bold"],
            textColor=_color("paper"),
            alignment=TA_CENTER,
        ),
    )
    title = Paragraph(
        _text(name),
        _style(
            base["body"],
            fontName=FONTS["bold"],
            fontSize=float(SIZES["body"]) + 1.5,
            leading=(float(SIZES["body"]) + 1.5) * 1.3,
            textColor=_color("ink"),
        ),
    )
    # Rozet tek satır kalsın: metin genişliği + iç boşluk (EN uzun).
    badge_width = min(
        inner * 0.55,
        stringWidth(badge_text, FONTS["bold"], float(SIZES["tiny"])) + 16.0,
    )
    title_row = _table(
        [[title, badge]],
        [max(inner - badge_width - 8.0, 20.0), badge_width],
        TableStyle(
            [
                ("BACKGROUND", (1, 0), (1, 0), accent),
                ("LEFTPADDING", (1, 0), (1, 0), 5),
                ("RIGHTPADDING", (1, 0), (1, 0), 5),
                ("TOPPADDING", (1, 0), (1, 0), 2),
                ("BOTTOMPADDING", (1, 0), (1, 0), 2),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("TOPPADDING", (0, 0), (0, 0), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 0),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        ),
    )

    content: list[Flowable] = [title_row]

    start = _month_of(_read(topic, "date_start"))
    end = _month_of(_read(topic, "date_end"))
    average = _read(topic, "average_stars")
    if start and end and average is not None:
        start_label, end_label = _month_span(lang, start, end)
        content.append(
            Paragraph(
                _text(
                    t(
                        lang,
                        "card_meta",
                        start=start_label,
                        end=end_label,
                        n=count,
                        avg=fmt_num(lang, float(average), 1),
                    )
                ),
                _style(base["tiny"], spaceBefore=3),
            )
        )

    quote_text = " ".join(str(quote or "").split())
    draft_text = " ".join(str(reply_draft or "").split())

    if summary_mode:
        bits: list[str] = []
        if quote_text:
            bits.append(_italic(f"“{shorten_quote(quote_text, 120)}”"))
        if draft_text:
            bits.append(_text(shorten_quote(draft_text, 140)))
        if bits:
            content.append(
                Paragraph(" — ".join(bits), _style(base["body"], spaceBefore=5))
            )
    else:
        if quote_text:
            content.append(
                Paragraph(
                    _italic(f"“{shorten_quote(quote_text, 240)}”"),
                    _style(base["quote"], spaceBefore=5),
                )
            )
        if draft_text:
            content.append(
                Paragraph(
                    _text(t(lang, "draft_label")),
                    _style(
                        base["tiny"],
                        fontName=FONTS["bold"],
                        textColor=accent,
                        spaceBefore=6,
                    ),
                )
            )
            draft_box = _table(
                [[Paragraph(_text(draft_text), base["body"])]],
                [inner - 14.0],
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), soft),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        ("TOPPADDING", (0, 0), (-1, -1), 6),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ]
                ),
            )
            content.append(Spacer(1, 3))
            content.append(draft_box)

    card = _table(
        [["", content]],
        [3.0, inner],
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), accent),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("TOPPADDING", (0, 0), (0, 0), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 9),
                ("RIGHTPADDING", (1, 0), (1, 0), 0),
                ("TOPPADDING", (1, 0), (1, 0), 2),
                ("BOTTOMPADDING", (1, 0), (1, 0), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        ),
    )
    return [KeepTogether([card])]


# ---------------------------------------------------------------------------
# 8 — Yanıtsız tablosu
# ---------------------------------------------------------------------------


def unanswered_table(lang: str, rows: Sequence[Any]) -> list[Flowable]:
    """``PUAN | YORUM | HAZIR YANIT TASLAĞI``; en fazla 3 satır.

    Satırlar ``UnansweredReview`` ya da ``{"stars", "text", "month", "reply"}``
    benzeri eşlemeler olabilir. Taslak yoksa hücre boş kalır ("N/A" yazılmaz).
    """
    register_fonts()
    items = [row for row in (rows or []) if row][:3]
    if not items:
        return []

    base = styles()
    width = _content_width()
    head_style = _style(
        base["tiny"], fontName=FONTS["bold"], textColor=_color("primary")
    )
    review_style = _style(base["body"], fontSize=8.5, leading=11.5)
    draft_style = _style(base["small"], textColor=_color("ink"))
    date_color = PALETTE["watch"]

    data: list[list[Any]] = [
        [
            Paragraph(_text(t(lang, "table_score")), head_style),
            Paragraph(_text(t(lang, "table_review")), head_style),
            Paragraph(_text(t(lang, "table_draft")), head_style),
        ]
    ]
    star_colors: list[HexColor] = []
    for row in items:
        stars = float(_read(row, "stars", 0) or 0)
        star_text = _star_text(lang, stars)
        star_colors.append(_star_color(stars))

        review_text = " ".join(str(_read(row, "text", "") or "").split())
        month = _month_of(_read(row, "month") or _read(row, "date"))
        meta = month_label(lang, month) if month else ""
        review = _text(shorten_quote(review_text, 160))
        if meta:
            review = f'{review}<br/><font size="7" color="{date_color}">{_text(meta)}</font>'
        data.append(
            [
                star_text,
                Paragraph(review, review_style),
                Paragraph(
                    _text(_read(row, "reply_draft") or _read(row, "reply") or ""),
                    draft_style,
                ),
            ]
        )

    width_star = 42.0
    width_review = width * 0.44
    width_draft = width - width_star - width_review

    commands: list[tuple[Any, ...]] = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, _color("primary")),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, _color("line")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("FONTNAME", (0, 0), (-1, 0), FONTS["bold"]),
        ("FONTSIZE", (0, 0), (-1, 0), float(SIZES["tiny"])),
        ("TEXTCOLOR", (0, 0), (-1, 0), _color("primary")),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
    ]
    for index, star_color in enumerate(star_colors, start=1):
        commands.extend(
            [
                ("FONTNAME", (0, index), (0, index), FONTS["bold"]),
                ("FONTSIZE", (0, index), (0, index), 9.5),
                ("TEXTCOLOR", (0, index), (0, index), star_color),
            ]
        )

    table = _table(data, [width_star, width_review, width_draft], TableStyle(commands))
    return [table, Spacer(1, 8)]


# ---------------------------------------------------------------------------
# 9 — Tek adım
# ---------------------------------------------------------------------------


def single_step_box(lang: str, step: Any) -> list[Flowable]:
    """Tam genişlik koyu teal kutu, beyaz metin: eylem + Neden/Emek/Ölçüm."""
    register_fonts()
    if not step:
        return []

    action = " ".join(str(_read(step, "action", "") or "").split())
    lines: list[tuple[str, str]] = []
    for key, label_key in (
        ("reason", "single_step_why"),
        ("effort", "single_step_effort"),
        ("how_to_measure", "single_step_measure"),
    ):
        value = " ".join(str(_read(step, key, "") or "").split())
        if value:
            lines.append((t(lang, label_key), value))
    if not action and not lines:
        return []

    white = _color("paper")
    base = styles()
    action_style = _style(
        base["body"],
        fontName=FONTS["bold"],
        fontSize=float(SIZES["body"]) + 1.5,
        leading=(float(SIZES["body"]) + 1.5) * 1.35,
        textColor=white,
    )
    line_style = _style(base["body"], textColor=white, leading=float(SIZES["body"]) * 1.55)

    content: list[Flowable] = []
    if action:
        content.append(Paragraph(_text(action), action_style))
    if lines:
        content.append(Spacer(1, 4))
    for label, value in lines:
        content.append(
            Paragraph(f"{_bold(label)} {_text(value)}", line_style)
        )

    box = _table(
        [[content]],
        [_content_width()],
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _color("primary")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 11),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        ),
    )
    return [box]


# ---------------------------------------------------------------------------
# 10 — Yöntem notu
# ---------------------------------------------------------------------------


def method_note(lang: str) -> list[Flowable]:
    """Küçük yöntem paragrafı; her raporda vardır."""
    register_fonts()
    return [Paragraph(_text(t(lang, "method_note")), styles()["tiny"])]


# ---------------------------------------------------------------------------
# 11–12 — Alt satır ve filigran
# ---------------------------------------------------------------------------


def closing_line(
    lang: str,
    config_footer: str | None,
    signature: str | None,
) -> list[Flowable]:
    """Kapanış satırı (plan §6 madde 11): sol CTA, sağ imza bloğu.

    ``config_footer`` boşsa (config'ten kapatıldı) sol hücre boş kalır; imza
    varsa sağda durur. İkisi de yoksa blok gizlenir.
    """
    register_fonts()
    if not str(config_footer or "").strip() and not str(signature or "").strip():
        return []

    left_text = " ".join(str(config_footer or "").split())
    base = styles()
    width = _content_width()
    left = Paragraph(
        _text(left_text), _style(base["tiny"], alignment=TA_LEFT)
    )
    signature_lines = [
        _text(line)
        for line in str(signature or "").splitlines()
        if line.strip()
    ]
    right = Paragraph(
        "<br/>".join(signature_lines),
        _style(
            base["tiny"],
            alignment=TA_RIGHT,
            textColor=_color("ink"),
            fontName=FONTS["bold"],
        ),
    )
    rule = HRFlowable(
        width="100%", thickness=0.6, color=_color("line"), spaceBefore=8, spaceAfter=5
    )
    row = _table(
        [[left, right]],
        [width * 0.58, width * 0.42],
        TableStyle(_no_padding()),
    )
    return [rule, row]


def footer_line(
    lang: str,
    config_footer: str | None,
    page: int,
    total: int,
    demo: bool = False,
) -> list[Flowable]:
    """Alt satır içeriği: sol demo uyarısı / CTA, sağ ``1 / 2``.

    Sayfanın en altına çizim için ``draw_footer`` / ``footer_callback``
    kullanılır; bu fonksiyon aynı metni akış içinde de basabilir.
    """
    register_fonts()
    width = _content_width()
    base = styles()
    left_text = (
        t(lang, "demo_disclaimer") if demo else str(config_footer or "").strip()
    )
    left_style = _style(base["tiny"], textColor=_color("watch"), alignment=TA_LEFT)
    right_style = _style(base["tiny"], textColor=_color("watch"), alignment=TA_RIGHT)
    row = _table(
        [
            [
                Paragraph(_text(left_text), left_style),
                Paragraph(
                    _text(t(lang, "page_number", page=int(page), total=int(total))),
                    right_style,
                ),
            ]
        ],
        [width * 0.78, width * 0.22],
        TableStyle(_no_padding()),
    )
    rule = HRFlowable(
        width="100%", thickness=0.5, color=_color("line"), spaceBefore=2, spaceAfter=3
    )
    return [rule, row]


def draw_footer(
    canvas: Any,
    doc: Any,
    *,
    lang: str = "tr",
    total: int = 0,
    demo: bool = False,
    cta: str | None = None,
) -> None:
    """``onPage`` uyumlu alt bilgi çizimi (sol metin + sağ sayfa numarası)."""
    register_fonts()
    width, _ = getattr(canvas, "_pagesize", pagesizes.A4)
    margin = _length(SIZES["margin"])
    y = 12.0 * mm
    page = int(getattr(doc, "page", 1) or 1)
    left_text = t(lang, "demo_disclaimer") if demo else (cta or t(lang, "footer_method_trace"))

    canvas.saveState()
    canvas.setStrokeColor(_color("line"))
    canvas.setLineWidth(0.5)
    canvas.line(margin, y + 9.0, width - margin, y + 9.0)
    canvas.setFont(FONTS["body"], float(SIZES["tiny"]))
    canvas.setFillColor(_color("watch"))
    canvas.drawString(margin, y, left_text)
    canvas.drawRightString(
        width - margin, y, t(lang, "page_number", page=page, total=total or page)
    )
    canvas.restoreState()


def footer_callback(
    lang: str,
    config_footer: str | None,
    total: int,
    demo: bool = False,
) -> Callable[[Any, Any], None]:
    """``onPage`` için hazır kapanış: ``draw_footer``ı sabit değerlerle çağırır."""

    def _draw(canvas: Any, doc: Any) -> None:
        draw_footer(
            canvas, doc, lang=lang, total=total, demo=demo, cta=config_footer
        )

    return _draw


def draw_watermark(canvas: Any, doc: Any, lang: str = "tr") -> None:
    """Sayfa ortasında açık gri, 45° döndürülmüş ``ÖRNEK`` filigranı."""
    del doc
    register_fonts()
    width, height = getattr(canvas, "_pagesize", pagesizes.A4)
    canvas.saveState()
    canvas.setFillColor(_color("watch"))
    try:
        canvas.setFillAlpha(0.16)  # renkten SONRA: setFillColor alfayı sıfırlar
    except AttributeError:  # eski canvas: alfa yok, açık renk yeter
        pass
    canvas.setFont(FONTS["bold"], 86)
    canvas.translate(width / 2.0, height / 2.0)
    canvas.rotate(45)
    canvas.drawCentredString(0, 0, t(lang, "demo_watermark"))
    canvas.restoreState()


def demo_watermark(lang: str = "tr") -> Callable[[Any, Any], None]:
    """``onPage`` uyumlu filigran kapanışı (Drawing değil, çizim fonksiyonu)."""

    def _draw(canvas: Any, doc: Any) -> None:
        draw_watermark(canvas, doc, lang)

    return _draw
