"""`rapor.pdf.report` testleri — plan §6, §9 (PDF akışı, bütçe, kırpma).

Dört fixture gerçek pipeline'dan geçirilir: ``normalize`` -> ``metrics`` ->
``insights`` -> ``tag`` (mock) -> ``aggregate`` -> ``write`` (mock) ->
``validate`` -> ``build_pdf``. Mock etiketleyici her fixture'da şikayet
kümesi üretmeyebilir; şikayet kartı yolu ayrıca sentetik ``Aggregated`` /
``WriteResult`` ile sınanır.
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

from rapor.config import DEFAULT_BANDS, DEFAULT_FIELD_MAP, Config  # noqa: E402
from rapor.normalize import normalize  # noqa: E402
from rapor.pdf import components  # noqa: E402
from rapor.pdf.report import (  # noqa: E402
    PAGE_LIMIT,
    PDFBuildResult,
    ReportBudgetError,
    build_pdf,
)
from rapor.pipeline.aggregate import (  # noqa: E402
    Aggregated,
    EvidenceReview,
    SentimentBreakdown,
    TopicCluster,
    UnansweredReview,
    aggregate,
)
from rapor.pipeline.insights import compute_insights  # noqa: E402
from rapor.pipeline.metrics import RecentWindow, compute_metrics  # noqa: E402
from rapor.pipeline.tag import tag_reviews  # noqa: E402
from rapor.pipeline.validate import ValidationResult, validate_report  # noqa: E402
from rapor.pipeline.write import write_report  # noqa: E402
from rapor.schemas import (  # noqa: E402
    ComplaintTheme,
    SingleStep,
    UnansweredReplyDraft,
    WriteResult,
)

FIXTURES = ROOT / "fixtures"
TODAY = datetime.date(2026, 11, 14)
NAMES = ("az", "cok", "yanitsiz", "altpuansiz")


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------


def _config() -> Config:
    return Config.model_validate(
        {
            "providers": {"mock": {"name": "mock", "adapter": "mock", "model": "mock"}},
            "steps": {"tag": {"profile": "mock"}, "write": {"profile": "mock"}},
            "field_map": DEFAULT_FIELD_MAP,
            "bands": [dict(band) for band in DEFAULT_BANDS],
        }
    )


class _Bundle:
    def __init__(self, place, metrics, insights, aggregated, write_result, validation):
        self.place = place
        self.metrics = metrics
        self.insights = insights
        self.aggregated = aggregated
        self.write_result = write_result
        self.validation = validation


def _load(name: str) -> tuple:
    data = normalize(
        json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    )
    return data.place, data.reviews


def _pipeline(name: str, tmp_path: Path, monkeypatch) -> _Bundle:
    """Fixture'ı gerçek pipeline adımlarından geçirir (ağ yok, mock profil)."""
    monkeypatch.setenv("RAPOR_STATE_DIR", str(tmp_path / ".state"))
    place, reviews = _load(name)
    config = _config()
    metrics = compute_metrics(place, reviews, config, today=TODAY)
    insights = compute_insights(metrics, reviews, config, lang="tr")
    work = tmp_path / "work"
    tagged = tag_reviews(reviews, config, work / "tag", use_cache=False)
    aggregated = aggregate(reviews, tagged.items, config, today=TODAY)
    write_result = write_report(
        metrics,
        insights,
        aggregated,
        reviews,
        config,
        work / "write",
        lang="tr",
        use_cache=False,
    )
    validation = validate_report(write_result, reviews, metrics, insights, aggregated)
    return _Bundle(place, metrics, insights, aggregated, write_result, validation)


def _build(bundle: _Bundle, tmp_path: Path, **kwargs) -> PDFBuildResult:
    return build_pdf(
        tmp_path / "out",
        bundle.place,
        bundle.metrics,
        bundle.insights,
        bundle.aggregated,
        bundle.write_result,
        bundle.validation,
        _config(),
        lang=kwargs.pop("lang", "tr"),
        report_date=TODAY,
        **kwargs,
    )


def _topic(
    name: str,
    count: int,
    *,
    strength: str,
    stars: float = 2.0,
    negative: bool = True,
    start: datetime.date = datetime.date(2026, 8, 1),
    end: datetime.date = datetime.date(2026, 10, 1),
    bulk: int = 1,
) -> TopicCluster:
    ids = [f"{name}-{index}" for index in range(count)]
    return TopicCluster(
        name=name,
        review_count=count,
        review_ids=ids,
        date_start=start,
        date_end=end,
        average_stars=stars,
        sentiment=SentimentBreakdown(
            positive=0 if negative else count,
            negative=count if negative else 0,
            neutral=0,
        ),
        recent_count=count,
        strength=strength,  # type: ignore[arg-type]
        evidence_reviews=[
            EvidenceReview(
                id=review_id,
                text=(
                    f"{name} konusunda uzun ve açıklayıcı bir yorum metni burada "
                    f"duruyor. " * bulk
                ),
                stars=stars,
                month="2026-10",
            )
            for review_id in ids
        ],
    )


def _complaint_theme(topic: TopicCluster, bulk: int = 1) -> ComplaintTheme:
    return ComplaintTheme(
        name=topic.name,
        review_ids=list(topic.review_ids),
        quote_review_id=topic.review_ids[0],
        quote="Uzun ve açıklayıcı bir yorum metni",
        reply_draft=(
            "Geri bildiriminiz için teşekkür ederiz; konuyu ekibimizle paylaştık "
            "ve en kısa sürede iyileştireceğiz. " * bulk
        ),
    )


def _synthetic(
    *,
    complaint_count: int = 5,
    watch_count: int = 2,
    praise_count: int = 6,
    unanswered: int = 8,
    step_action: str | None = None,
    bulk: int = 1,
) -> _Bundle:
    """Şikayet/övgü/yanıtsız yollarını sınamak için sentetik girdi."""
    place, reviews = _load("cok")
    config = _config()
    metrics = compute_metrics(place, reviews, config, today=TODAY)
    insights = compute_insights(metrics, reviews, config, lang="tr")

    complaints = [
        _topic(f"şikayet {index}", 6 - (index % 3), strength="strong", bulk=bulk)
        for index in range(complaint_count)
    ]
    complaints += [
        _topic(f"izleme {index}", 2, strength="watch", bulk=bulk)
        for index in range(watch_count)
    ]
    praise = [
        _topic(
            f"övgü {index}",
            5,
            strength="strong",
            stars=4.8,
            negative=False,
            bulk=bulk,
        )
        for index in range(praise_count)
    ]
    rows = [
        UnansweredReview(
            id=f"u-{index}",
            stars=1.0 + (index % 3),
            text="Yanıt bekleyen bir yorum metni. " * bulk,
            month="2026-10",
            date=datetime.date(2026, 10, 1),
        )
        for index in range(unanswered)
    ]
    aggregated = Aggregated(
        praise_topics=praise,
        complaint_topics=complaints,
        products_praised=[],
        unanswered_list=rows,
    )

    unanswered_ids = {row.id for row in rows}
    draft_ids = sorted(unanswered_ids)[:3]
    step_evidence = (
        complaints[0].review_ids[0] if complaints else "u-0"
    )
    action = step_action or "Servis akışını bu hafta tek bir noktada iyileştirin."
    write_result = WriteResult(
        themes_praise=[],
        themes_complaint=[_complaint_theme(topic, bulk) for topic in complaints],
        products_praised=[],
        instagram_caption="Bu hafta gelen güzel yorumlar için teşekkürler.",
        top_quotes=[],
        single_step=SingleStep(
            action=action,
            reason="Yorumlarda bu konu tekrar ediyor.",
            evidence_review_ids=[step_evidence],
            effort="1–2 saat",
            how_to_measure="Sonraki 30 günde konu geçen yorumların ortalama puanı",
        ),
        unanswered_reply_drafts=[
            UnansweredReplyDraft(
                review_id=review_id,
                reply="Yorumunuz için teşekkür ederiz; geri bildiriminizi dikkate alacağız.",
            )
            for review_id in draft_ids
        ],
    )
    validation = ValidationResult(schema_valid=True, valid=True)
    return _Bundle(place, metrics, insights, aggregated, write_result, validation)


def _shrink_bundle(bundle: _Bundle, **metrics_changes) -> _Bundle:
    metrics = bundle.metrics.model_copy(update=metrics_changes)
    return _Bundle(
        bundle.place,
        metrics,
        bundle.insights,
        bundle.aggregated,
        bundle.write_result,
        bundle.validation,
    )


# ---------------------------------------------------------------------------
# Dört fixture
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", NAMES)
def test_fixture_builds_valid_pdf(name, tmp_path, monkeypatch):
    bundle = _pipeline(name, tmp_path, monkeypatch)

    result = _build(bundle, tmp_path)

    assert isinstance(result, PDFBuildResult)
    assert result.path.exists()
    assert result.path.name == "rapor.pdf"
    assert result.path.stat().st_size > 0
    assert result.page_count <= PAGE_LIMIT
    payload = result.path.read_bytes()
    assert payload.startswith(b"%PDF")
    assert result.sections
    assert "overview" in result.sections or "monthly_chart" in result.sections


def test_fonts_are_embedded(tmp_path, monkeypatch):
    bundle = _pipeline("az", tmp_path, monkeypatch)

    payload = _build(bundle, tmp_path).path.read_bytes()

    assert b"DejaVuSans" in payload


def test_altpuansiz_hides_service_section(tmp_path, monkeypatch):
    bundle = _pipeline("altpuansiz", tmp_path, monkeypatch)

    result = _build(bundle, tmp_path)

    assert "service_ratings" not in result.sections
    assert "distribution" in result.sections


def test_yanitsiz_shows_unanswered_section(tmp_path, monkeypatch):
    bundle = _pipeline("yanitsiz", tmp_path, monkeypatch)

    result = _build(bundle, tmp_path)

    assert "unanswered" in result.sections


def test_full_response_rate_hides_unanswered_section(tmp_path, monkeypatch):
    bundle = _pipeline("cok", tmp_path, monkeypatch)
    metrics = bundle.metrics.model_copy(
        update={
            "response_rate": 1.0,
            "responded_count": bundle.metrics.total_reviews,
            "unanswered_count": 0,
            "recent_90d": RecentWindow(count=0, avg=None),
        }
    )
    insights = bundle.insights.model_copy(update={"response_section_visible": False})
    aggregated = bundle.aggregated.model_copy(update={"unanswered_list": []})
    trimmed = _Bundle(
        bundle.place, metrics, insights, aggregated, bundle.write_result, bundle.validation
    )

    result = _build(trimmed, tmp_path)

    assert "unanswered" not in result.sections


def test_place_title_enters_title_block(tmp_path, monkeypatch):
    bundle = _pipeline("az", tmp_path, monkeypatch)
    seen: list[str] = []
    original = components.title_block

    def _spy(place_title, scope_text):
        seen.append(place_title)
        return original(place_title, scope_text)

    monkeypatch.setattr(components, "title_block", _spy)
    _build(bundle, tmp_path)

    assert seen
    assert set(seen) == {bundle.place.title}
    assert any(ord(char) > 127 for char in seen[0])


# ---------------------------------------------------------------------------
# Kırpma ve bütçe
# ---------------------------------------------------------------------------


def test_budget_trims_excess_content(tmp_path):
    bundle = _synthetic(complaint_count=10, watch_count=6, praise_count=16, bulk=10)

    result = _build(bundle, tmp_path)

    assert result.page_count <= PAGE_LIMIT
    assert result.trimmed
    assert result.path.stat().st_size > 0


def test_budget_raises_when_core_does_not_fit(tmp_path):
    huge = "Uzun tek adım metni " * 900
    bundle = _synthetic(
        complaint_count=1,
        watch_count=0,
        praise_count=1,
        unanswered=1,
        step_action=huge,
    )

    with pytest.raises(ReportBudgetError):
        _build(bundle, tmp_path)


def test_watch_cards_are_first_trim_step(tmp_path):
    bundle = _synthetic(complaint_count=0, watch_count=8, praise_count=14)

    result = _build(bundle, tmp_path)

    assert result.page_count <= PAGE_LIMIT
    if result.trimmed:
        assert result.trimmed[0] == "izlenmeli kartlar"


# ---------------------------------------------------------------------------
# Demo filigranı, determinizm
# ---------------------------------------------------------------------------


def test_demo_draws_watermark_on_every_page(tmp_path, monkeypatch):
    bundle = _pipeline("az", tmp_path, monkeypatch)
    calls: list[int] = []

    def _spy(canvas, doc, lang="tr"):
        calls.append(int(getattr(doc, "page", 1) or 1))

    monkeypatch.setattr(components, "draw_watermark", _spy)
    result = _build(bundle, tmp_path, demo=True)

    # Rapor iki kez basılır (ölçüm + son baskı); her iki turda tüm sayfalar.
    assert set(calls) == set(range(1, result.page_count + 1))


def test_demo_off_draws_no_watermark(tmp_path, monkeypatch):
    bundle = _pipeline("az", tmp_path, monkeypatch)
    calls: list[int] = []

    monkeypatch.setattr(
        components, "draw_watermark", lambda canvas, doc, lang="tr": calls.append(1)
    )
    _build(bundle, tmp_path, demo=False)

    assert calls == []


def test_build_is_deterministic(tmp_path, monkeypatch):
    bundle = _pipeline("az", tmp_path, monkeypatch)

    first = _build(bundle, tmp_path / "a")
    second = _build(bundle, tmp_path / "b")

    assert first.sections == second.sections
    assert first.page_count == second.page_count
    assert first.trimmed == second.trimmed
    sizes = (first.path.stat().st_size, second.path.stat().st_size)
    assert abs(sizes[0] - sizes[1]) <= max(sizes) * 0.05


# ---------------------------------------------------------------------------
# Kart sınırları ve gizlenen bloklar
# ---------------------------------------------------------------------------


def test_complaint_cards_capped_at_three_strong_two_watch(tmp_path, monkeypatch):
    bundle = _synthetic(complaint_count=6, watch_count=5, praise_count=1)
    calls: list[tuple[str, bool]] = []
    original = components.complaint_card

    def _spy(lang, topic, quote, reply_draft, *, strong=True, summary_mode=False):
        calls.append((topic.name, strong))
        return original(
            lang,
            topic,
            quote,
            reply_draft,
            strong=strong,
            summary_mode=summary_mode,
        )

    monkeypatch.setattr(components, "complaint_card", _spy)
    result = _build(bundle, tmp_path)

    assert result.page_count <= PAGE_LIMIT
    # Rapor iki kez basılır (ölçüm + son baskı); her tur aynı kartları çizer.
    strong_names = {name for name, strong in calls if strong}
    watch_names = {name for name, strong in calls if not strong}
    assert 0 < len(strong_names) <= 3
    assert len(watch_names) <= 2


def test_hidden_blocks_are_not_rendered(tmp_path, monkeypatch):
    bundle = _synthetic(complaint_count=2, watch_count=0, praise_count=3)
    hidden = bundle.validation.model_copy(
        update={
            "hidden_blocks": ["theme_praise:0:övgü 0", "instagram_caption"],
            "valid": False,
        }
    )
    bundle = _Bundle(
        bundle.place,
        bundle.metrics,
        bundle.insights,
        bundle.aggregated,
        bundle.write_result,
        hidden,
    )
    topics: list[str] = []
    instagram: list[str] = []
    original_row = components.topic_row
    original_box = components.instagram_box

    def _row(lang, topic, max_count):
        topics.append(topic.name)
        return original_row(lang, topic, max_count)

    def _box(lang, caption):
        instagram.append(str(caption))
        return original_box(lang, caption)

    monkeypatch.setattr(components, "topic_row", _row)
    monkeypatch.setattr(components, "instagram_box", _box)
    _build(bundle, tmp_path)

    assert "övgü 0" not in topics
    assert topics
    assert instagram == []


def test_unanswered_rows_capped_and_drafts_matched(tmp_path, monkeypatch):
    bundle = _synthetic(complaint_count=0, watch_count=0, praise_count=1, unanswered=6)
    rows: list[list] = []
    original = components.unanswered_table

    def _spy(lang, items):
        rows.append(list(items))
        return original(lang, items)

    monkeypatch.setattr(components, "unanswered_table", _spy)
    _build(bundle, tmp_path)

    assert rows
    assert len(rows[0]) <= 3
    # İlk satır yanıtsız sırasının başıdır; taslağı varsa eşleşmiş olmalı.
    first = rows[0][0]
    draft = first["reply_draft"] if isinstance(first, dict) else None
    assert draft is None or draft.startswith("Yorumunuz için")
