"""`rapor.pdf.components` testleri — plan §6 sayfa anatomisi blokları."""

from __future__ import annotations

import datetime
import html
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reportlab.lib.colors import HexColor  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    Flowable,
    HRFlowable,
    KeepTogether,
    Paragraph,
    Spacer,
    Table,
)

from rapor.pdf import components as c  # noqa: E402
from rapor.pdf.theme import FONTS, PALETTE  # noqa: E402
from rapor.pipeline.aggregate import (  # noqa: E402
    EvidenceReview,
    SentimentBreakdown,
    TopicCluster,
    UnansweredReview,
)

ALLOWED = (Paragraph, Table, KeepTogether, Spacer, HRFlowable)


def _flatten(items):
    for item in items:
        yield item
        if isinstance(item, KeepTogether):
            yield from _flatten(item._content)
        elif isinstance(item, Table):
            for row in item._cellvalues:
                for cell in row:
                    if isinstance(cell, Flowable):
                        yield from _flatten([cell])
                    elif isinstance(cell, list):
                        yield from _flatten(cell)


def _paragraphs(items):
    return [item for item in _flatten(items) if isinstance(item, Paragraph)]


def _tables(items):
    return [item for item in _flatten(items) if isinstance(item, Table)]


def _markup(paragraph: Paragraph) -> str:
    """Kaçırılmış markup'ı okunur metne çevirir."""
    return html.unescape(paragraph.text)


def _topic(
    *,
    name: str = "Servis yavaşlığı",
    count: int = 5,
    strength: str = "strong",
    stars: float = 2.2,
    quote: str = "Servis çok yavaştı, kırk dakika bekledik.",
    with_dates: bool = True,
) -> TopicCluster:
    return TopicCluster(
        name=name,
        review_count=count,
        review_ids=[f"r{i}" for i in range(count)],
        date_start=datetime.date(2026, 9, 3) if with_dates else None,
        date_end=datetime.date(2026, 11, 2) if with_dates else None,
        average_stars=stars,
        sentiment=SentimentBreakdown(negative=count),
        recent_count=count,
        strength=strength,
        evidence_reviews=[
            EvidenceReview(id="r0", text=quote, stars=1, month="2026-09")
        ],
    )


# ---------------------------------------------------------------------------
# Genel sözleşme
# ---------------------------------------------------------------------------


def test_all_blocks_return_flowables() -> None:
    blocks = {
        "header": c.header_line("tr", datetime.date(2026, 11, 14)),
        "title": c.title_block("Örnek Pasta & Cafe", "Google Maps · 112 yorum"),
        "stats": c.stat_boxes(
            "tr", [{"value": "82", "label_key": "stat_score", "sub": "100 üzerinden"}]
        ),
        "heading": c.section_heading("tr", "section_overview"),
        "overview": c.overview_block("tr", 82, "İyi", "Memnun.", "Ağırlıklı."),
        "topic": c.topic_row("tr", _topic(), 22),
        "products": c.products_line("tr", [{"name": "Cheesecake"}]),
        "instagram": c.instagram_box("tr", "Bugün cheesecake günü."),
        "complaint": c.complaint_card("tr", _topic(), "Yavaş.", "Teşekkürler."),
        "unanswered": c.unanswered_table(
            "tr", [{"stars": 2, "text": "Soğuk.", "month": "2026-10", "reply": "Üzgünüz."}]
        ),
        "step": c.single_step_box(
            "tr", {"action": "Menüyü güncelle", "reason": "Kanıt", "effort": "1 saat"}
        ),
        "method": c.method_note("tr"),
        "closing": c.closing_line(
            "tr",
            "İsterseniz bu raporu her ay güncelleyelim.",
            "Kaan Can Güner · TrueReviews\nkcguner@gmail.com\n<KCG />",
        ),
        "footer": c.footer_line("tr", "Her ay güncellenir", 1, 2),
    }
    for name, items in blocks.items():
        assert items, name
        assert all(isinstance(item, Flowable) for item in items), name
        assert all(isinstance(item, ALLOWED) for item in items), name
        for item in items:
            if isinstance(item, KeepTogether):
                for inner in item._content:
                    inner.wrap(451, 700)
            else:
                item.wrap(451, 200)


def test_empty_input_returns_empty_list() -> None:
    assert c.title_block("", "") == []
    assert c.stat_boxes("tr", []) == []
    assert c.overview_block("tr", None, "", "", "") == []
    assert c.topic_row("tr", None, 5) == []
    assert c.products_line("tr", []) == []
    assert c.instagram_box("tr", "") == []
    assert c.complaint_card("tr", None, None, None) == []
    assert c.unanswered_table("tr", []) == []
    assert c.single_step_box("tr", {}) == []
    assert c.closing_line("tr", None, None) == []


def test_turkish_characters_render_in_paragraph_text() -> None:
    items = c.title_block("Şişli Çığ Döner & İskender", "Kapsam: Ağustos – Kasım")
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "Şişli" in text and "İskender" in text and "Ağustos" in text


# ---------------------------------------------------------------------------
# 1–2 üst çizgi, başlık
# ---------------------------------------------------------------------------


def test_header_line_has_brand_date_and_rule() -> None:
    items = c.header_line("tr", datetime.date(2026, 11, 14))
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "TrueReviews · Kişisel Rapor" in text
    assert "Rapor tarihi: 14 Kas 2026" in text
    assert any(isinstance(item, HRFlowable) for item in items)


def test_title_block_is_kept_together() -> None:
    items = c.title_block("Örnek Pasta & Cafe", "Google Maps · 112 yorum")
    assert len(items) == 1 and isinstance(items[0], KeepTogether)
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "Örnek Pasta & Cafe" in text and "112 yorum" in text


# ---------------------------------------------------------------------------
# 3 beş kutu
# ---------------------------------------------------------------------------


def test_stat_boxes_five_cells_with_values() -> None:
    stats = [
        {"value": "4,4", "label_key": "stat_google_score", "sub": "112 yorum üzerinden"},
        {"value": "112", "label_key": "stat_reviews_read", "sub": "Oca – Kas 2026"},
        {"value": "18", "label_key": "stat_recent_90d", "sub": "son 3 ay"},
        {"value": "12 / 64", "label_key": "stat_response_rate", "sub": "12 / 64"},
        {"value": "82", "label_key": "stat_score", "sub": "100 üzerinden"},
    ]
    table = _tables(c.stat_boxes("tr", stats))[0]
    assert len(table._cellvalues[0]) == 5
    values = [_markup(cell) for cell in table._cellvalues[0]]
    assert values == ["4,4", "112", "18", "12 / 64", "82"]
    labels = [_markup(cell) for cell in table._cellvalues[1]]
    assert labels[0] == "GOOGLE PUANI"
    assert labels[4] == "MEMNUNİYET SKORU"
    assert "112 yorum üzerinden" in _markup(table._cellvalues[2][0])


def test_stat_boxes_skip_missing_entries() -> None:
    table = _tables(
        c.stat_boxes(
            "tr",
            [
                {"value": "4,4", "label_key": "stat_google_score", "sub": "x"},
                None,
            ],
        )
    )[0]
    assert len(table._cellvalues[0]) == 1


# ---------------------------------------------------------------------------
# 4–5 bölüm başlığı, genel görünüm
# ---------------------------------------------------------------------------


def test_section_heading_text() -> None:
    items = c.section_heading("en", "section_problems")
    assert "3 · Where are the problems?" in _markup(items[0])


def test_overview_block_shows_score_band_and_method() -> None:
    items = c.overview_block(
        "tr", 82, "İyi", "Müşteriler genel olarak memnun.", "Ağırlıklı ortalama."
    )
    assert len(items) == 1 and isinstance(items[0], KeepTogether)
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "82" in text and "/100" in text
    assert "İyi" in text and "Müşteriler genel olarak memnun." in text
    assert "Nasıl hesaplandı?" in text and "Ağırlıklı ortalama." in text


def test_overview_block_without_score_is_hidden() -> None:
    assert c.overview_block("tr", None, "İyi", "x", "y") == []


# ---------------------------------------------------------------------------
# 6 övgü konusu, ürünler, Instagram
# ---------------------------------------------------------------------------


def test_topic_row_bar_ratio_follows_max_count() -> None:
    items = c.topic_row("tr", _topic(count=5), 20)
    bar = [t for t in _tables(items) if t._argH == [4]][0]
    filled, rest = bar._argW
    assert filled / (filled + rest) == pytest.approx(5 / 20, abs=0.01)


def test_topic_row_full_bar_at_max() -> None:
    items = c.topic_row("tr", _topic(count=20), 20)
    bar = [t for t in _tables(items) if t._argH == [4]][0]
    filled, rest = bar._argW
    assert filled / (filled + rest) == pytest.approx(1.0, abs=0.01)
    assert rest > 0


def test_topic_row_text_and_quote() -> None:
    items = c.topic_row("tr", _topic(quote="Servis çok yavaştı."), 22)
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "Servis yavaşlığı" in text
    assert "5 yorumda geçiyor" in text
    assert "“Servis çok yavaştı.”" in text


def test_topic_row_english_count_label() -> None:
    items = c.topic_row("en", _topic(count=3), 10)
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "mentioned in 3 reviews" in text


def test_shorten_quote_truncates_words_and_adds_ellipsis() -> None:
    short = c.shorten_quote("kısa metin", 100)
    assert short == "kısa metin"
    long = c.shorten_quote("kelime " * 40, 40)
    assert long.endswith("…") and len(long) <= 45
    assert "  " not in long


def test_products_line_lists_names() -> None:
    items = c.products_line(
        "tr", [{"name": "Cheesecake"}, {"name": "Latte"}, "Brownie"]
    )
    assert "En çok övülen ürünler: Cheesecake, Latte, Brownie" in _markup(items[0])


def test_instagram_box_has_soft_background() -> None:
    table = _tables(c.instagram_box("tr", "Bugün cheesecake günü."))[0]
    assert table._bkgrndcmds[0][-1] == HexColor(PALETTE["primary_soft"])
    text = " ".join(_markup(p) for p in _paragraphs([table]))
    assert "Instagram'da paylaşabilirsiniz" in text
    assert "Bugün cheesecake günü." in text


# ---------------------------------------------------------------------------
# 7 şikayet kartı
# ---------------------------------------------------------------------------


def test_complaint_card_strong_badge_and_meta() -> None:
    items = c.complaint_card("tr", _topic(count=5), "Çok yavaştı.", "Teşekkürler.")
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "GÜÇLÜ SİNYAL · 5 yorum" in text
    assert "Eyl–Kas 2026 arasında 5 yorum, ortalama 2,2 ★" in text
    assert "HAZIR YANIT TASLAĞI" in text
    assert "Çok yavaştı." in text and "Teşekkürler." in text


def test_complaint_card_watch_badge() -> None:
    topic = _topic(count=2, strength="watch")
    items = c.complaint_card("tr", topic, "Biraz yavaştı.", None, strong=False)
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "İZLENMELİ · 2 yorum" in text
    assert "GÜÇLÜ" not in text
    assert "HAZIR YANIT TASLAĞI" not in text  # taslak yoksa etiket yok


def test_complaint_card_title_row_badge_color() -> None:
    strong = _tables(c.complaint_card("tr", _topic(), "x", "y"))[0]
    watch = _tables(
        c.complaint_card("tr", _topic(strength="watch"), "x", "y", strong=False)
    )[0]
    colors = {cmd[-1] for cmd in strong._bkgrndcmds}
    assert HexColor(PALETTE["complaint"]) in colors
    assert HexColor(PALETTE["watch"]) in {
        cmd[-1] for cmd in watch._bkgrndcmds
    }


def test_complaint_card_summary_mode_is_shorter() -> None:
    full = c.complaint_card("tr", _topic(), "Çok yavaştı, kırk dakika bekledik.", "Uzun taslak metni.")
    summary = c.complaint_card(
        "tr", _topic(), "Çok yavaştı, kırk dakika bekledik.", "Uzun taslak metni.",
        summary_mode=True,
    )
    full_text = " ".join(_markup(p) for p in _paragraphs(full))
    summary_text = " ".join(_markup(p) for p in _paragraphs(summary))
    assert "HAZIR YANIT TASLAĞI" not in summary_text
    assert len(_paragraphs(summary)) < len(_paragraphs(full))
    assert len(summary_text) < len(full_text)


def test_complaint_card_turkish_stars_use_comma() -> None:
    items = c.complaint_card("en", _topic(stars=2.2), "Yavaş.", "Thanks.")
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "average 2.2 ★" in text


# ---------------------------------------------------------------------------
# 8 yanıtsız tablosu
# ---------------------------------------------------------------------------


def test_unanswered_table_headers_and_limit() -> None:
    rows = [
        UnansweredReview(id=f"r{i}", stars=float(i), text=f"yorum {i}", month="2026-10")
        for i in range(1, 6)
    ]
    table = _tables(c.unanswered_table("tr", rows))[0]
    header = [_markup(cell) for cell in table._cellvalues[0]]
    assert header == ["PUAN", "YORUM", "HAZIR YANIT TASLAĞI"]
    assert len(table._cellvalues) == 4  # başlık + 3 satır


def test_unanswered_table_star_colors() -> None:
    rows = [
        {"stars": 1.0, "text": "a", "month": "2026-10"},
        {"stars": 3.0, "text": "b", "month": "2026-10"},
        {"stars": 5.0, "text": "c", "month": "2026-10"},
    ]
    table = _tables(c.unanswered_table("tr", rows))[0]
    colors = [table._cellStyles[row][0].color for row in (1, 2, 3)]
    assert colors[0] == HexColor(PALETTE["complaint"])
    assert colors[1] == HexColor(PALETTE["watch"])
    assert colors[2] == HexColor(PALETTE["primary"])


def test_unanswered_table_month_label() -> None:
    table = _tables(
        c.unanswered_table(
            "tr", [{"stars": 2.0, "text": "soğuk geldi", "month": "2026-10"}]
        )
    )[0]
    review = _markup(table._cellvalues[1][1])
    assert "Eki 2026" in review and "soğuk geldi" in review


# ---------------------------------------------------------------------------
# 9 tek adım
# ---------------------------------------------------------------------------


def test_single_step_box_is_teal_with_white_text() -> None:
    items = c.single_step_box(
        "tr",
        {
            "action": "Menüyü güncelle",
            "reason": "Şikayetler tekrarlıyor.",
            "effort": "1 saat",
            "how_to_measure": "Yanıt oranı",
        },
    )
    table = _tables(items)[0]
    assert table._bkgrndcmds[0][-1] == HexColor(PALETTE["primary"])
    paragraphs = _paragraphs(items)
    assert paragraphs and all(
        p.style.textColor == HexColor(PALETTE["paper"]) for p in paragraphs
    )
    text = " ".join(_markup(p) for p in paragraphs)
    assert "Menüyü güncelle" in text
    assert "Neden:" in text and "Emek:" in text and "Ölçüm:" in text
    assert f'<font face="{FONTS["bold"]}">Neden:</font>' in text


def test_single_step_box_english_labels() -> None:
    items = c.single_step_box(
        "en", {"action": "Update menu", "reason": "Evidence", "effort": "1 hour"}
    )
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "Why:" in text and "Effort:" in text and "Measurement:" not in text


# ---------------------------------------------------------------------------
# 10–12 yöntem, alt bilgi, filigran
# ---------------------------------------------------------------------------


def test_method_note_mentions_numbers_from_code() -> None:
    text = _markup(c.method_note("tr")[0])
    assert "Sayılar kodla hesaplandı" in text
    assert "yorumcu adları raporda yer almaz" in text


def test_closing_line_cta_and_signature() -> None:
    items = c.closing_line(
        "tr",
        "İsterseniz bu raporu her ay güncelleyelim.",
        "Kaan Can Güner · TrueReviews\nkcguner@gmail.com\n<KCG />",
    )
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "her ay güncelleyelim" in text
    assert "Kaan Can Güner" in text and "kcguner@gmail.com" in text
    raw = " ".join(p.text for p in _paragraphs(items))
    assert "İsterseniz" in raw
    assert "&lt;KCG /&gt;" in raw  # logo metni kaçırılmış, markup değil


def test_closing_line_keeps_signature_when_cta_disabled() -> None:
    items = c.closing_line("tr", "", "Kaan Can Güner · TrueReviews")
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "Kaan Can Güner" in text


def test_footer_line_demo_and_page_number() -> None:
    items = c.footer_line("tr", "Her ay güncellenir", 1, 2, demo=True)
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "örnek amaçlıdır" in text
    assert "1 / 2" in text


def test_footer_line_real_report_uses_config_cta() -> None:
    items = c.footer_line("tr", "Her ay güncellenir", 2, 3)
    text = " ".join(_markup(p) for p in _paragraphs(items))
    assert "Her ay güncellenir" in text
    assert "2 / 3" in text


class _Canvas:
    """Çizim çağrılarını kaydeden sahte canvas."""

    def __init__(self) -> None:
        self._pagesize = (595.0, 842.0)
        self.calls: list[tuple] = []

    def saveState(self) -> None: ...
    def restoreState(self) -> None: ...
    def setStrokeColor(self, *a, **k) -> None: ...
    def setFillColor(self, *a, **k) -> None: ...
    def setLineWidth(self, *a) -> None: ...
    def setFont(self, *a) -> None: ...
    def setFillAlpha(self, *a) -> None: ...
    def line(self, *a) -> None:
        self.calls.append(("line",) + a)

    def drawString(self, *a) -> None:
        self.calls.append(("drawString",) + a)

    def drawRightString(self, *a) -> None:
        self.calls.append(("drawRightString",) + a)

    def drawCentredString(self, *a) -> None:
        self.calls.append(("centred",) + a)

    def translate(self, *a) -> None:
        self.calls.append(("translate",) + a)

    def rotate(self, *a) -> None:
        self.calls.append(("rotate",) + a)


def test_draw_footer_writes_left_text_and_page_number() -> None:
    canvas = _Canvas()
    c.draw_footer(canvas, type("D", (), {"page": 2})(), total=2)
    strings = [call for call in canvas.calls if call[0] in {"drawString", "drawRightString"}]
    assert strings[0][3] == "Yöntem: sayılar kodla, alıntılar birebir."
    assert strings[1][3] == "2 / 2"


def test_draw_footer_demo_uses_disclaimer() -> None:
    canvas = _Canvas()
    c.draw_footer(canvas, type("D", (), {"page": 1})(), total=1, demo=True)
    strings = [call for call in canvas.calls if call[0] == "drawString"]
    assert "örnek amaçlıdır" in strings[0][3]


def test_draw_watermark_rotates_and_writes_sample() -> None:
    canvas = _Canvas()
    c.draw_watermark(canvas, None)
    kinds = [call[0] for call in canvas.calls]
    assert "rotate" in kinds
    assert ("centred", 0, 0, "ÖRNEK") in canvas.calls


def test_callbacks_are_plain_functions() -> None:
    assert callable(c.demo_watermark("tr"))
    assert callable(c.footer_callback("tr", "CTA", 2))
