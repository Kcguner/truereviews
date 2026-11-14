"""PDF akışı — sayfa anatomisi, sayfa bütçesi, kırpma, filigran (plan §6).

Akış iki sayfaya hedeflenir, üst sınır üçtür. Sayfa sayısı ``doc.page`` ile
ölçülür; üçü aşarsa plan §6'daki kırpma sırası uygulanır ve rapor yeniden
kurulur. Döngü sonludur: sıra tükenip çekirdek (tek adım + yöntem notu + alt
bilgi) üç sayfaya sığmazsa ``ReportBudgetError`` fırlatılır.

Sayfa numarası, alt bilgi ve demo filigranı ``onPage`` geri çağrısıyla canvas
üzerine çizilir; bunlar akışın yüksekliğini etkilemez. Numara için toplam sayfa
sayısı ancak ölçüm sonrası bilindiğinden rapor iki kez basılır: ölçüm (toplam
bilinmez) ve son baskı (toplam bilinir).

Kırpma durumu ``_TrimState`` alanlarıdır. Her adım durumu kesin biçimde
değiştirir; bu yüzden döngü ilerler. Kullanılan adım etiketleri
``PDFBuildResult.trimmed`` içinde döner ve çağıran bunları ``review.md``'ye
yazar.
"""

from __future__ import annotations

import datetime
import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from reportlab.lib import pagesizes
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.doctemplate import LayoutError

from rapor.pdf import components
from rapor.pdf.charts import (
    monthly_line_chart,
    service_ratings_chart,
    star_distribution_chart,
)
from rapor.pdf.i18n import fmt_num, month_label, t
from rapor.pdf.theme import FONTS, PALETTE, SIZES, register_fonts, styles
from rapor.state import slugify

__all__ = ["PDFBuildResult", "ReportBudgetError", "build_pdf", "PAGE_LIMIT"]

PAGE_LIMIT = 3
PDF_FILENAME = "rapor.pdf"

# Kırpma öncesi üst sınırlar (plan §6 madde 6–8).
PRAISE_TOPIC_LIMIT = 4
STRONG_CARD_LIMIT = 3
WATCH_CARD_LIMIT = 2
UNANSWERED_ROW_LIMIT = 3


# ---------------------------------------------------------------------------
# Sonuç / hata
# ---------------------------------------------------------------------------


@dataclass
class PDFBuildResult:
    """PDF çıktısı ve kurulum izi.

    ``sections`` basılan bölümlerin kararlı anahtarlarıdır
    (``"overview"``, ``"service_ratings"``, ``"unanswered"`` ...). ``trimmed``
    uygulanan kırpma adımlarının Türkçe etiketleridir.
    """

    path: Path
    page_count: int
    trimmed: list[str] = field(default_factory=list)
    sections: list[str] = field(default_factory=list)


class ReportBudgetError(RuntimeError):
    """Kırpma sırası tükendiği hâlde rapor üç sayfaya sığmadı."""


@dataclass
class _TrimState:
    """Kırpma sırasının değiştirdiği kurulum alanları."""

    praise_limit: int = PRAISE_TOPIC_LIMIT
    strong_limit: int = STRONG_CARD_LIMIT
    watch_limit: int = WATCH_CARD_LIMIT
    unanswered_limit: int = UNANSWERED_ROW_LIMIT
    charts: set[str] = field(
        default_factory=lambda: {"line", "distribution", "service"}
    )
    summary_mode: bool = False


# ---------------------------------------------------------------------------
# Küçük yardımcılar
# ---------------------------------------------------------------------------


def _read(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _content_width() -> float:
    page = getattr(pagesizes, str(SIZES["page"]).upper(), pagesizes.A4)
    return float(page[0]) - 2.0 * _mm(SIZES["margin"])


def _mm(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().lower()
    if text.endswith("mm"):
        return float(text[:-2].strip()) * mm
    return float(text)


def _date_label(lang: str, value: Any) -> str:
    if isinstance(value, datetime.datetime):
        value = value.date()
    if isinstance(value, datetime.date):
        return month_label(lang, value.strftime("%Y-%m"))
    return ""


def _percent(lang: str, value: float) -> str:
    pct = int(round(float(value) * 100))
    return f"%{pct}" if lang != "en" else f"{pct}%"


def _hidden(validation: Any) -> set[str]:
    return set(getattr(validation, "hidden_blocks", None) or [])


def _hidden_theme_names(validation: Any, prefix: str) -> set[str]:
    """``theme_praise:2:lezzet`` -> ``{"lezzet"}``."""
    names: set[str] = set()
    for block in _hidden(validation):
        if not block.startswith(prefix + ":"):
            continue
        parts = block.split(":", 2)
        if len(parts) == 3:
            names.add(parts[2])
    return names


def _hidden_draft_indexes(validation: Any) -> set[int]:
    indexes: set[int] = set()
    for block in _hidden(validation):
        if not block.startswith("unanswered_reply_drafts:"):
            continue
        try:
            indexes.add(int(block.rsplit(":", 1)[1]))
        except ValueError:
            continue
    return indexes


def _subheading(lang: str, key: str) -> list[Any]:
    base = styles()
    style = base["body"]
    bold = ParagraphStyle(
        f"Sub-{key}",
        parent=style,
        fontName=FONTS["bold"],
        fontSize=float(SIZES["body"]),
        leading=float(SIZES["body"]) * 1.3,
    )
    return [Paragraph(t(lang, key), bold), Spacer(1, 3)]


def _flatten_keep(items: Sequence[Any]) -> list[Any]:
    """Tablo hücresine giren ``KeepTogether`` sarmalını açar.

    İç içe ``KeepTogether`` (hücre içinde) reportlab'da sonsuz yükseklik
    üretir; kolon içeriği bu yüzden düz flowable listesi olmalıdır.
    """
    result: list[Any] = []
    for item in items:
        if isinstance(item, KeepTogether):
            result.extend(_flatten_keep(getattr(item, "_content", []) or []))
        else:
            result.append(item)
    return result


def _columns(
    left: Sequence[Any], right: Sequence[Any], *, ratio: float = 0.56
) -> list[Any]:
    """İki kolon: hücrelere flowable listeleri konur."""
    if not left:
        return list(right)
    if not right:
        return list(left)
    left = _flatten_keep(left)
    right = _flatten_keep(right)
    width = _content_width()
    table = Table(
        [[list(left), list(right)]],
        colWidths=[width * ratio, width * (1.0 - ratio)],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 10),
                ("RIGHTPADDING", (1, 0), (1, 0), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return [table]


# ---------------------------------------------------------------------------
# Sayfa 1 — kapsam, kutular, genel görünüm, dağılım
# ---------------------------------------------------------------------------


def _method_note_text(lang: str, metrics: Any, config: Any) -> str | None:
    """Genel görünümün "Nasıl hesaplandı?" paragrafı (gerçek sayılarla)."""
    average = _read(metrics, "average_stars")
    if average is None:
        return None
    positive = _read(metrics, "positive_ratio")
    recent = _read(_read(metrics, "recent_90d"), "avg")
    if recent is None:
        recent = average
    weights = _read(_read(config, "scoring"), "weights")
    w1 = float(_read(weights, "average", 0.60))
    w2 = float(_read(weights, "positive_ratio", 0.25))
    w3 = float(_read(weights, "recent", 0.15))

    avg_text = fmt_num(lang, float(average), 1)
    recent_text = fmt_num(lang, float(recent), 1)
    if lang == "en":
        ratio_text = f"{int(round(float(positive) * 100))}%" if positive is not None else ""
        return (
            f"The score combines the overall average ({avg_text}/5), the positive "
            f"ratio ({ratio_text}) and the last-90-day average ({recent_text}/5). "
            f"Weights: average {int(round(w1 * 100))}%, positive ratio "
            f"{int(round(w2 * 100))}%, recent average {int(round(w3 * 100))}%."
        )
    ratio_text = _percent(lang, float(positive)) if positive is not None else ""
    return (
        f"Skor; genel ortalama ({avg_text}/5), olumlu oran ({ratio_text}) ve son "
        f"90 gün ortalamasının ({recent_text}/5) ağırlıklı bileşimidir. Ağırlıklar: "
        f"ortalama %{int(round(w1 * 100))}, olumlu oran %{int(round(w2 * 100))}, "
        f"güncel ortalama %{int(round(w3 * 100))}."
    )


def _stat_items(lang: str, place: Any, metrics: Any) -> list[dict[str, Any]]:
    """Beş kutu; eksik veri kutusu gönderilmez (İlke 4)."""
    stats: list[dict[str, Any]] = []

    google = _read(place, "total_score")
    if google is None:
        google = _read(metrics, "average_stars")
    total = int(_read(metrics, "total_reviews", 0) or 0)
    if google is not None:
        count = _read(place, "reviews_count") or total
        stats.append(
            {
                "value": fmt_num(lang, float(google), 1),
                "label_key": "stat_google_score",
                "sub": t(lang, "stat_google_sub", n=int(count)),
            }
        )

    if total:
        scope = _read(metrics, "scope")
        scope_label = ""
        if scope is not None:
            scope_label = (
                f"{_date_label(lang, _read(scope, 'start_date'))} – "
                f"{_date_label(lang, _read(scope, 'end_date'))}"
            )
        stats.append(
            {
                "value": str(total),
                "label_key": "stat_reviews_read",
                "sub": scope_label,
            }
        )

    stats.append(
        {
            "value": str(int(_read(_read(metrics, "recent_90d"), "count", 0) or 0)),
            "label_key": "stat_recent_90d",
            "sub": t(lang, "stat_recent_sub"),
        }
    )

    rate = _read(metrics, "response_rate")
    if rate is not None:
        responded = int(_read(metrics, "responded_count", 0) or 0)
        stats.append(
            {
                "value": f"{responded}/{total}",
                "label_key": "stat_response_rate",
                "sub": _percent(lang, float(rate)),
            }
        )

    score = _read(metrics, "score")
    if score is not None:
        stats.append(
            {
                "value": fmt_num(lang, float(score), 0),
                "label_key": "stat_score",
                "sub": t(lang, "stat_score_sub"),
            }
        )
    return stats


def _scope_text(lang: str, metrics: Any) -> str:
    scope = _read(metrics, "scope")
    total = int(_read(metrics, "total_reviews", 0) or 0)
    if scope is None:
        return ""
    return t(
        lang,
        "scope_line",
        start=_date_label(lang, _read(scope, "start_date")),
        end=_date_label(lang, _read(scope, "end_date")),
        n=total,
    )


def _overview_section(
    lang: str,
    metrics: Any,
    insights: Any,
    config: Any,
    state: _TrimState,
) -> tuple[list[Any], list[str]]:
    sections: list[str] = []
    left = components.overview_block(
        lang,
        _read(metrics, "score"),
        _read(insights, "band_label"),
        _read(insights, "verdict"),
        _method_note_text(lang, metrics, config),
    )
    right: list[Any] = []
    if "line" in state.charts:
        drawing = monthly_line_chart(
            _read(metrics, "monthly_series") or [],
            _read(insights, "anomaly_months") or [],
            lang,
            width=220,
            height=104,
        )
        if drawing is not None:
            right.append(drawing)
            sections.append("monthly_chart")
    base = styles()
    anomaly = _read(insights, "anomaly")
    if anomaly:
        right.append(Spacer(1, 3))
        right.append(Paragraph(str(anomaly), base["small"]))
    fallback = _read(insights, "fallback_note")
    if fallback:
        right.append(Paragraph(str(fallback), base["tiny"]))

    if not left and not right:
        return [], sections
    block = _columns(left, right)
    return [
        KeepTogether(
            [*components.section_heading(lang, "section_overview"), *block]
        )
    ], sections


def _distribution_section(
    lang: str, metrics: Any, state: _TrimState
) -> tuple[list[Any], list[str]]:
    sections: list[str] = []
    left: list[Any] = []
    right: list[Any] = []

    star_distribution = _read(metrics, "star_distribution") or {}
    if "distribution" in state.charts and any(star_distribution.values()):
        drawing = star_distribution_chart(star_distribution, lang, width=210, height=92)
        if drawing is not None:
            left = [*_subheading(lang, "star_distribution"), drawing]
            sections.append("distribution")

    service_ratings = _read(metrics, "service_ratings") or {}
    if "service" in state.charts and service_ratings:
        drawing = service_ratings_chart(service_ratings, lang, width=210, height=92)
        if drawing is not None:
            right = [*_subheading(lang, "service_ratings"), drawing]
            sections.append("service_ratings")

    if not left and not right:
        return [], sections
    return [*_columns(left, right, ratio=0.5), Spacer(1, 6)], sections


# ---------------------------------------------------------------------------
# Sayfa 1 — övgü
# ---------------------------------------------------------------------------


def _praise_section(
    lang: str,
    aggregated: Any,
    write_result: Any,
    validation: Any,
    state: _TrimState,
) -> tuple[list[Any], list[str]]:
    hidden_themes = _hidden_theme_names(validation, "theme_praise")
    topics = [
        topic
        for topic in (_read(aggregated, "praise_topics") or [])
        if str(_read(topic, "name", "")) not in hidden_themes
    ][: state.praise_limit]

    body: list[Any] = []
    if topics:
        max_count = max(int(_read(topic, "review_count", 0) or 0) for topic in topics)
        for topic in topics:
            body.extend(components.topic_row(lang, topic, max_count))

    if "products_praised" not in _hidden(validation):
        body.extend(
            components.products_line(lang, _read(aggregated, "products_praised") or [])
        )

    if "instagram_caption" not in _hidden(validation):
        body.extend(
            components.instagram_box(
                lang, _read(write_result, "instagram_caption")
            )
        )

    if not body:
        return [], []
    # İlk konu satırı başlıkla birlikte korunur; ``topic_row`` kendi
    # ``KeepTogether``ını döndürür, iç içe sarmak yüksekliği bozar.
    first = _flatten_keep(body[:1])
    return [
        KeepTogether([*components.section_heading(lang, "section_praise"), *first]),
        *body[1:],
    ], ["praise"]


# ---------------------------------------------------------------------------
# Sayfa 2 — şikayetler, yanıtsız, tek adım
# ---------------------------------------------------------------------------


def _matching_theme(themes: Sequence[Any], name: str, index: int) -> Any | None:
    folded = name.casefold()
    for theme in themes:
        if str(_read(theme, "name", "")).casefold() == folded:
            return theme
    if len(themes) > index:
        return themes[index]
    return None


def _problems_section(
    lang: str,
    aggregated: Any,
    write_result: Any,
    validation: Any,
    state: _TrimState,
) -> tuple[list[Any], list[str]]:
    hidden_themes = _hidden_theme_names(validation, "theme_complaint")
    all_topics = _read(aggregated, "complaint_topics") or []
    visible: list[Any] = []
    for index, topic in enumerate(all_topics):
        if str(_read(topic, "name", "")) in hidden_themes:
            continue
        visible.append((index, topic))

    strong = [item for item in visible if _read(item[1], "strength") == "strong"]
    watch = [item for item in visible if _read(item[1], "strength") != "strong"]
    # Kanıt gücü yüksek olan önce; düşürme listeye sondan dokunur.
    strong = strong[: max(0, state.strong_limit)]
    watch = watch[: max(0, state.watch_limit)]
    selected = strong + watch
    if not selected:
        return [], []

    themes_complaint = _read(write_result, "themes_complaint") or []
    base = styles()
    body: list[Any] = [Paragraph(t(lang, "signal_intro"), base["small"]), Spacer(1, 5)]
    for index, topic in selected:
        name = str(_read(topic, "name", ""))
        theme = _matching_theme(themes_complaint, name, index)
        quote = _read(theme, "quote") if theme is not None else None
        draft = _read(theme, "reply_draft") if theme is not None else None
        if theme is not None and str(_read(theme, "name", "")) in hidden_themes:
            continue
        body.extend(
            components.complaint_card(
                lang,
                topic,
                quote,
                draft,
                strong=_read(topic, "strength") == "strong",
                summary_mode=state.summary_mode,
            )
        )
        body.append(Spacer(1, 7))

    # Başlık + giriş + ilk kart birlikte kalır (başlık sayfa sonunda yalnız
    # kalmaz). Kart ``KeepTogether`` sarmalı açılır: iç içe sarma yüksekliği
    # bozar.
    head = [*components.section_heading(lang, "section_problems"), body[0], body[1]]
    if len(body) > 2:
        head.extend(_flatten_keep([body[2]]))
        return [KeepTogether(head), *body[3:]], ["problems"]
    return [KeepTogether(head)], ["problems"]


def _unanswered_section(
    lang: str,
    metrics: Any,
    insights: Any,
    aggregated: Any,
    write_result: Any,
    validation: Any,
    state: _TrimState,
) -> tuple[list[Any], list[str]]:
    rate = _read(metrics, "response_rate")
    if rate is not None and float(rate) >= 1.0:
        return [], []
    if not bool(_read(insights, "response_section_visible", True)):
        return [], []
    if state.unanswered_limit <= 0:
        return [], []

    drafts = {
        str(_read(draft, "review_id")): _read(draft, "reply")
        for draft in (_read(write_result, "unanswered_reply_drafts") or [])
    }
    hidden_drafts = _hidden_draft_indexes(validation)
    visible_drafts = [
        draft
        for index, draft in enumerate(
            _read(write_result, "unanswered_reply_drafts") or []
        )
        if index not in hidden_drafts
    ]
    drafts = {
        str(_read(draft, "review_id")): _read(draft, "reply")
        for draft in visible_drafts
    }

    rows: list[dict[str, Any]] = []
    for review in _read(aggregated, "unanswered_list") or []:
        if len(rows) >= state.unanswered_limit:
            break
        review_id = str(_read(review, "id", ""))
        rows.append(
            {
                "stars": _read(review, "stars"),
                "text": _read(review, "text"),
                "month": _read(review, "month"),
                "reply_draft": drafts.get(review_id),
            }
        )
    if not rows:
        return [], []

    base = styles()
    intro = Paragraph(
        t(
            lang,
            "unanswered_intro",
            unanswered=int(_read(metrics, "unanswered_count", len(rows)) or len(rows)),
        ),
        base["small"],
    )
    table = components.unanswered_table(lang, rows)
    if not table:
        return [], []
    heading = components.section_heading(lang, "section_unanswered")
    # Başlık + oran cümlesi + tablo birlikte; tablo sayfaya sığmazsa
    # ``KeepTogether`` kendisi böler.
    return [
        KeepTogether([*heading, intro, Spacer(1, 4), *table]),
    ], ["unanswered"]


def _single_step_section(
    lang: str, write_result: Any, validation: Any
) -> tuple[list[Any], list[str]]:
    if "single_step" in _hidden(validation):
        return [], []
    if not bool(getattr(validation, "schema_valid", True)):
        return [], []
    step = _read(write_result, "single_step")
    box = components.single_step_box(lang, step)
    if not box:
        return [], []
    return [
        KeepTogether(
            [*components.section_heading(lang, "section_single_step"), *box]
        )
    ], ["single_step"]


# ---------------------------------------------------------------------------
# Alt satır (akış) ve sayfa altı (canvas)
# ---------------------------------------------------------------------------


def _bottom_line(lang: str, config: Any) -> list[Any]:
    footer = _read(_read(config, "pdf"), "footer")
    cta_enabled = bool(_read(footer, "cta_enabled", True))
    cta = str(_read(footer, "cta_text", "") or "") if cta_enabled else ""
    owner = str(_read(footer, "owner_name", "") or "")
    brand = str(_read(footer, "brand", "") or "")
    email = str(_read(footer, "email", "") or "")
    signature = str(_read(footer, "signature", "") or "")

    base = styles()
    left_style = base["small"]
    right_style = base["tiny"]
    left: list[Any] = [Paragraph(cta, left_style)] if cta else []
    lines = [value for value in (f"{owner} · {brand}".strip(" ·"), email, signature) if value]
    right: list[Any] = [Paragraph(line, right_style) for line in lines]

    width = _content_width()
    row = Table(
        [[left, right]],
        colWidths=[width * 0.62, width * 0.38],
        hAlign="LEFT",
    )
    row.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    rule = HRFlowable(
        width="100%", thickness=0.5, color=PALETTE["line"], spaceBefore=8, spaceAfter=4
    )
    return [Spacer(1, 4), rule, row]


def _draw_footer(
    canvas: Any,
    doc: Any,
    *,
    lang: str,
    total: int,
    demo: bool,
    footer_trace: str,
) -> None:
    register_fonts()
    width, _ = getattr(canvas, "_pagesize", pagesizes.A4)
    margin = _mm(SIZES["margin"])
    y = 12.0 * mm
    page = int(getattr(doc, "page", 1) or 1)
    left = t(lang, "demo_disclaimer") if demo else footer_trace

    canvas.saveState()
    canvas.setStrokeColor(PALETTE["line"])
    canvas.setLineWidth(0.5)
    canvas.line(margin, y + 9.0, width - margin, y + 9.0)
    canvas.setFont(FONTS["body"], float(SIZES["tiny"]))
    canvas.setFillColor(PALETTE["watch"])
    canvas.drawString(margin, y, left)
    canvas.drawRightString(
        width - margin, y, t(lang, "page_number", page=page, total=total or page)
    )
    canvas.restoreState()


def _make_on_page(
    lang: str, total: int, demo: bool, footer_trace: str
) -> Callable[[Any, Any], None]:
    def _draw(canvas: Any, doc: Any) -> None:
        if demo:
            components.draw_watermark(canvas, doc, lang)
        _draw_footer(
            canvas, doc, lang=lang, total=total, demo=demo, footer_trace=footer_trace
        )

    return _draw


# ---------------------------------------------------------------------------
# Akış kurulumu
# ---------------------------------------------------------------------------


def _build_story(
    *,
    place: Any,
    metrics: Any,
    insights: Any,
    aggregated: Any,
    write_result: Any,
    validation: Any,
    config: Any,
    lang: str,
    report_date: datetime.date,
    state: _TrimState,
) -> tuple[list[Any], list[str]]:
    story: list[Any] = []
    sections: list[str] = []

    story.extend(components.header_line(lang, report_date))
    story.extend(
        components.title_block(str(_read(place, "title", "")), _scope_text(lang, metrics))
    )
    boxes = components.stat_boxes(lang, _stat_items(lang, place, metrics))
    if boxes:
        story.extend(boxes)

    overview, overview_sections = _overview_section(
        lang, metrics, insights, config, state
    )
    if overview:
        story.extend(overview)
        sections.extend(overview_sections)

    distribution, distribution_sections = _distribution_section(lang, metrics, state)
    if distribution:
        story.extend(distribution)
        sections.extend(distribution_sections)

    praise, praise_sections = _praise_section(
        lang, aggregated, write_result, validation, state
    )
    if praise:
        story.extend(praise)
        sections.extend(praise_sections)

    problems, problem_sections = _problems_section(
        lang, aggregated, write_result, validation, state
    )
    if problems:
        story.extend(problems)
        sections.extend(problem_sections)

    unanswered, unanswered_sections = _unanswered_section(
        lang, metrics, insights, aggregated, write_result, validation, state
    )
    if unanswered:
        story.extend(unanswered)
        sections.extend(unanswered_sections)

    step, step_sections = _single_step_section(lang, write_result, validation)
    if step:
        story.extend(step)
        sections.extend(step_sections)

    story.extend([Spacer(1, 6), *components.method_note(lang)])
    story.extend(_bottom_line(lang, config))
    return story, sections


def _render(
    story: list[Any],
    *,
    place: Any,
    lang: str,
    demo: bool,
    total: int,
) -> tuple[bytes, int]:
    buffer = io.BytesIO()
    margin = _mm(SIZES["margin"])
    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesizes.A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
        title=f"{_read(place, 'title', '')} · TrueReviews",
        author="TrueReviews",
        pageCompression=0,
    )
    on_page = _make_on_page(
        lang, total, demo, t(lang, "footer_method_trace")
    )
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buffer.getvalue(), int(doc.page)


def _render_or_raise(
    story: list[Any], *, place: Any, lang: str, demo: bool, total: int
) -> tuple[bytes, int]:
    """Tek bir flowable bile çerçeveye sığmazsa bütçe hatasına çevirir."""
    try:
        return _render(story, place=place, lang=lang, demo=demo, total=total)
    except LayoutError as exc:
        raise ReportBudgetError(
            "Rapor üç sayfaya sığmadı; tek bir blok sayfa çerçevesinden büyük. "
            "Kırpma sırası bu bloğu küçültemez."
        ) from exc


# ---------------------------------------------------------------------------
# Kırpma sırası (plan §6)
# ---------------------------------------------------------------------------


def _trim_watch(state: _TrimState) -> bool:
    if state.watch_limit <= 0:
        return False
    state.watch_limit = 0
    return True


def _trim_praise_topics(state: _TrimState) -> bool:
    if state.praise_limit <= 1:
        return False
    state.praise_limit -= 1
    return True


def _trim_top_quotes(state: _TrimState) -> bool:
    """``top_quotes`` ayrı blok olarak basılmaz: alıntılar konu satırlarına girer.

    Adım sırada durur; kaldırılacak ayrı bir flowable olmadığı için durumu
    değiştirmez.
    """
    del state
    return False


def _trim_service_chart(state: _TrimState) -> bool:
    if "service" not in state.charts:
        return False
    state.charts.discard("service")
    return True


def _trim_distribution_chart(state: _TrimState) -> bool:
    if "distribution" not in state.charts:
        return False
    state.charts.discard("distribution")
    return True


def _trim_line_chart(state: _TrimState) -> bool:
    if "line" not in state.charts:
        return False
    state.charts.discard("line")
    return True


def _trim_unanswered_rows(state: _TrimState) -> bool:
    if state.unanswered_limit <= 0:
        return False
    state.unanswered_limit -= 1
    return True


def _trim_summary_mode(state: _TrimState) -> bool:
    if state.summary_mode:
        return False
    state.summary_mode = True
    return True


def _trim_complaint_cards(state: _TrimState) -> bool:
    if state.strong_limit <= 0:
        return False
    state.strong_limit -= 1
    return True


_TRIM_STEPS: tuple[tuple[str, Callable[[_TrimState], bool]], ...] = (
    ("izlenmeli kartlar", _trim_watch),
    ("fazla övgü konuları", _trim_praise_topics),
    ("top_quotes", _trim_top_quotes),
    ("hizmet grafiği", _trim_service_chart),
    ("puan dağılımı grafiği", _trim_distribution_chart),
    ("aylık çizgi grafiği", _trim_line_chart),
    ("yanıtsız satırları", _trim_unanswered_rows),
    ("kart özet modu", _trim_summary_mode),
    ("en düşük kanıtlı tema kartları", _trim_complaint_cards),
)

# Kırpma döngüsü emniyeti: her adım durumu değiştirdiği için üst sınır geniştir.
_MAX_TRIM_STEPS = 64


# ---------------------------------------------------------------------------
# Ana fonksiyon
# ---------------------------------------------------------------------------


def build_pdf(
    out_dir: str | Path,
    place: Any,
    metrics: Any,
    insights: Any,
    aggregated: Any,
    write_result: Any,
    validation: Any,
    config: Any,
    *,
    lang: str = "tr",
    demo: bool = False,
    report_date: datetime.date | None = None,
) -> PDFBuildResult:
    """Raporu ``out/<slug>/rapor.pdf`` olarak yazar.

    Args:
        out_dir: Çıktı kökü (``out``) ya da hazır çalışma dizini
            (``out/<slug>``). Ad slug ile eşleşmiyorsa slug altına yazılır.
        place: ``Place``.
        metrics: ``Metrics`` (tüm sayılar buradan).
        insights: ``Insights`` (bant/verdict/anomali cümleleri).
        aggregated: ``Aggregated`` (konu kümeleri, yanıtsız listesi).
        write_result: ``WriteResult`` (alıntı, taslak, Instagram, tek adım).
        validation: ``ValidationResult`` (gizlenen bloklar).
        config: ``Config`` (``pdf.footer``).
        lang: Rapor dili.
        demo: ``True`` ise her sayfaya ``ÖRNEK`` filigranı ve demo uyarısı.
        report_date: Rapor tarihi; ``None`` -> bugün.

    Returns:
        ``PDFBuildResult``: yol, sayfa sayısı, kırpma etiketleri, bölümler.

    Raises:
        ReportBudgetError: Kırpma sırası tükendiği hâlde üç sayfaya sığmazsa.
    """
    report_day = report_date or datetime.date.today()
    target = Path(out_dir)
    slug = slugify(str(_read(place, "title", "") or ""))
    if target.name != slug:
        target = target / slug
    target.mkdir(parents=True, exist_ok=True)
    path = target / PDF_FILENAME

    state = _TrimState()
    trimmed: list[str] = []
    step_index = 0
    sections: list[str] = []
    data = b""
    pages = 0

    for _ in range(_MAX_TRIM_STEPS + 1):
        story, sections = _build_story(
            place=place,
            metrics=metrics,
            insights=insights,
            aggregated=aggregated,
            write_result=write_result,
            validation=validation,
            config=config,
            lang=lang,
            report_date=report_day,
            state=state,
        )
        data, pages = _render_or_raise(
            story, place=place, lang=lang, demo=demo, total=0
        )
        if pages <= PAGE_LIMIT:
            break

        applied = False
        while step_index < len(_TRIM_STEPS):
            label, step = _TRIM_STEPS[step_index]
            if step(state):
                if label not in trimmed:
                    trimmed.append(label)
                applied = True
                break
            step_index += 1
        if not applied:
            raise ReportBudgetError(
                "Rapor üç sayfaya sığmadı; kırpma sırası tükendi. "
                f"Son sayfa sayısı: {pages}. Çekirdek bloklar (tek adım, "
                "yöntem notu, alt bilgi) korunur."
            )
    else:  # pragma: no cover - güvenlik ağı
        raise ReportBudgetError("Kırpma döngüsü sonlanmadı.")

    # Son baskı: toplam sayfa sayısı artık bilinir, alt bilgi "n / total" yazar.
    story, sections = _build_story(
        place=place,
        metrics=metrics,
        insights=insights,
        aggregated=aggregated,
        write_result=write_result,
        validation=validation,
        config=config,
        lang=lang,
        report_date=report_day,
        state=state,
    )
    data, pages = _render_or_raise(
        story, place=place, lang=lang, demo=demo, total=pages
    )
    path.write_bytes(data)
    return PDFBuildResult(
        path=path, page_count=pages, trimmed=trimmed, sections=sections
    )
