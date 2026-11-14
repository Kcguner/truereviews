"""`rapor.pipeline.aggregate` testleri — plan §5-C, §9.

Kanonikleştirme, kanıt gücü eşikleri, övgü/şikayet ayrımı, yanıtsız
sıralaması ve determinizm. `cok` fixture'ında etiketler `providers/mock.py`
ile üretilir; `tag.py`'ye bağımlılık yok.
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
from rapor.pipeline.aggregate import (  # noqa: E402
    Aggregated,
    aggregate,
    canonicalize,
)
from rapor.providers import mock  # noqa: E402
from rapor.schemas import Review, TagItem  # noqa: E402

FIXTURES = ROOT / "fixtures"
TODAY = datetime.date(2026, 11, 14)

ALIASES = {
    "servis": ["garson", "servis hızı"],
    "lezzet": ["tat", "aroma"],
    "fiyat": ["pahalılık", "fiyat/performans"],
}


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------


def _config(aliases: dict | None = None) -> Config:
    return Config.model_validate(
        {
            "providers": {"mock": {"name": "mock", "adapter": "mock", "model": "mock"}},
            "steps": {"tag": {"profile": "mock"}, "write": {"profile": "mock"}},
            "field_map": DEFAULT_FIELD_MAP,
            "bands": [dict(band) for band in DEFAULT_BANDS],
            "topic_aliases": aliases or {},
        }
    )


def _review(
    rid: str,
    stars: float,
    *,
    day: datetime.date | None = None,
    answered: bool = False,
    text: str = "metin",
) -> Review:
    return Review(
        id=rid,
        text=text,
        stars=stars,
        date=day,
        month=day.strftime("%Y-%m") if day else "",
        answered=answered,
    )


def _tag(
    rid: str,
    sentiment: str,
    *,
    topics: list[str] | None = None,
    products: list[str] | None = None,
) -> TagItem:
    return TagItem(
        id=rid,
        sentiment=sentiment,  # type: ignore[arg-type]
        topics=topics or [],
        products=products or [],
        severity=1,
    )


def _load(name: str):
    return normalize(json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8")))


def _mock_tags(reviews: list[Review]) -> list[TagItem]:
    """`tag.py` yerine mock adaptörü doğrudan çağırır (deterministik)."""
    records = [
        {
            "id": review.id,
            "text": review.text,
            "stars": review.stars,
            "month": review.month,
            "answered": review.answered,
        }
        for review in reviews
    ]
    user = "Yorumlar:\n" + json.dumps(records, ensure_ascii=False)
    result = mock.generate(
        None, "Yorumları etiketle", user, None, "low", 4096, None
    )
    return [TagItem.model_validate(item) for item in result.data]


# ---------------------------------------------------------------------------
# Kanonikleştirme
# ---------------------------------------------------------------------------


def test_canonicalize_merges_casefold_trim_and_aliases():
    assert canonicalize(
        ["Garson ", "garson", "Servis Hızı", "servis hızı"], ALIASES
    ) == ["servis"]


def test_canonicalize_nfkc_turkish_i():
    # "İ" casefold'u "i" + U+0307 üretir; NFKC sonrası "içecek" ile birleşmeli.
    assert canonicalize(["İÇECEK", "içecek "], {}) == ["içecek"]


def test_canonicalize_unmatched_stays_separate():
    assert canonicalize(["Kahve", "kahve ", "çay"], ALIASES) == ["kahve", "çay"]


def test_canonical_display_is_alias_key_form():
    # Anahtarın orijinal biçimi okunur ad olur; eş anlamlı o ada birleşir.
    assert canonicalize(["GARSON"], {"Servis": ["Garson"]}) == ["Servis"]


def test_aggregate_uses_canonical_name_for_cluster():
    reviews = [_review("r1", 5.0)]
    tags = [_tag("r1", "positive", topics=["Garson "])]
    result = aggregate(reviews, tags, _config(ALIASES), today=TODAY)
    assert [cluster.name for cluster in result.praise_topics] == ["servis"]


# ---------------------------------------------------------------------------
# Kanıt gücü
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("count", "expected"),
    [(1, "watch"), (2, "watch"), (3, "strong"), (5, "strong")],
)
def test_evidence_strength_thresholds(count: int, expected: str):
    reviews = [_review(f"r{index}", 4.0) for index in range(count)]
    tags = [_tag(f"r{index}", "positive", topics=["servis"]) for index in range(count)]
    result = aggregate(reviews, tags, _config(), today=TODAY)
    cluster = result.praise_topics[0]
    assert cluster.review_count == count
    assert len(cluster.review_ids) == count
    assert cluster.strength == expected


# ---------------------------------------------------------------------------
# Övgü / şikayet ayrımı
# ---------------------------------------------------------------------------


def test_positive_sentiment_majority_makes_praise_topic():
    reviews = [_review(f"r{index}", 4.0) for index in range(3)]
    tags = [
        _tag("r0", "positive", topics=["servis"]),
        _tag("r1", "positive", topics=["servis"]),
        _tag("r2", "negative", topics=["servis"]),
    ]
    result = aggregate(reviews, tags, _config(), today=TODAY)
    assert result.praise_topics and not result.complaint_topics
    assert result.praise_topics[0].sentiment.positive == 2


def test_negative_sentiment_majority_makes_complaint_topic():
    reviews = [_review(f"r{index}", 2.0) for index in range(3)]
    tags = [
        _tag("r0", "negative", topics=["servis"]),
        _tag("r1", "negative", topics=["servis"]),
        _tag("r2", "neutral", topics=["servis"]),
    ]
    result = aggregate(reviews, tags, _config(), today=TODAY)
    assert result.complaint_topics and not result.praise_topics


def test_sentiment_tie_falls_back_to_average_below_three():
    reviews = [_review("r0", 2.0), _review("r1", 2.0)]
    tags = [
        _tag("r0", "negative", topics=["servis"]),
        _tag("r1", "positive", topics=["servis"]),
    ]
    result = aggregate(reviews, tags, _config(), today=TODAY)
    assert [c.name for c in result.complaint_topics] == ["servis"]
    assert result.praise_topics == []


def test_sentiment_tie_with_average_at_least_three_is_praise():
    reviews = [_review("r0", 4.0), _review("r1", 3.0)]
    tags = [
        _tag("r0", "negative", topics=["servis"]),
        _tag("r1", "positive", topics=["servis"]),
    ]
    result = aggregate(reviews, tags, _config(), today=TODAY)
    assert [c.name for c in result.praise_topics] == ["servis"]
    assert result.complaint_topics == []


# ---------------------------------------------------------------------------
# Yanıtsız listesi
# ---------------------------------------------------------------------------


def test_unanswered_sorted_low_stars_then_newest():
    reviews = [
        _review("old-low", 2.0, day=datetime.date(2026, 1, 10)),
        _review("new-low", 2.0, day=datetime.date(2026, 9, 10)),
        _review("high", 5.0, day=datetime.date(2026, 10, 10)),
        _review("mid", 3.0, day=datetime.date(2026, 8, 10)),
        _review("answered", 1.0, day=datetime.date(2026, 11, 1), answered=True),
    ]
    result = aggregate(reviews, [], _config(), today=TODAY)
    assert [row.id for row in result.unanswered_list] == [
        "new-low",
        "old-low",
        "mid",
        "high",
    ]
    assert result.unanswered_list[0].month == "2026-09"


def test_unanswered_row_shape():
    review = _review("r1", 2.0, day=datetime.date(2026, 5, 3), text="soğuktu")
    result = aggregate([review], [], _config(), today=TODAY)
    row = result.unanswered_list[0]
    assert (row.id, row.stars, row.text, row.month, row.date) == (
        "r1",
        2.0,
        "soğuktu",
        "2026-05",
        datetime.date(2026, 5, 3),
    )


# ---------------------------------------------------------------------------
# Konu kümesi detayları
# ---------------------------------------------------------------------------


def test_topic_dates_average_sentiment_and_evidence():
    day1 = datetime.date(2025, 3, 1)
    day2 = datetime.date(2025, 9, 1)
    reviews = [
        _review("b", 2.0, day=day2, text="yavaş"),
        _review("a", 4.0, day=day1, text="güzel"),
        _review("c", 4.0, day=None, text="tarihsiz"),
    ]
    tags = [_tag(rid, "positive" if rid != "b" else "negative", topics=["servis"]) for rid in ("a", "b", "c")]
    result = aggregate(reviews, tags, _config(), today=TODAY)
    cluster = result.praise_topics[0]

    assert cluster.review_count == 3
    assert cluster.review_ids == ["a", "b", "c"]
    assert cluster.date_start == day1
    assert cluster.date_end == day2
    assert cluster.average_stars == 3.3  # (2+4+4)/3
    assert cluster.sentiment.model_dump() == {
        "positive": 2,
        "negative": 1,
        "neutral": 0,
    }
    # Kanıt sırası: yıldız artan, sonra id.
    assert [item.id for item in cluster.evidence_reviews] == ["b", "a", "c"]
    assert cluster.evidence_reviews[0].text == "yavaş"


def test_duplicate_tags_count_review_once():
    reviews = [_review("r1", 4.0)]
    tags = [
        _tag("r1", "positive", topics=["Garson"]),
        _tag("r1", "positive", topics=["servis"]),
    ]
    result = aggregate(reviews, tags, _config(ALIASES), today=TODAY)
    cluster = result.praise_topics[0]
    assert cluster.review_count == 1
    assert cluster.review_ids == ["r1"]
    assert cluster.sentiment.positive == 1


def test_products_praised_canonical_unique_and_average():
    reviews = [
        _review("r1", 5.0),
        _review("r2", 4.0),
        _review("r3", 3.0),
    ]
    tags = [
        _tag("r1", "positive", products=["Garson"]),
        _tag("r1", "positive", products=["garson"]),
        _tag("r2", "positive", products=["Garson"]),
    ]
    result = aggregate(reviews, tags, _config(ALIASES), today=TODAY)
    product = result.products_praised[0]
    assert product.name == "servis"
    assert product.review_count == 2
    assert product.review_ids == ["r1", "r2"]
    assert product.average_stars == 4.5


def test_unknown_tag_id_is_ignored():
    result = aggregate([_review("r1", 4.0)], [_tag("ghost", "positive", topics=["servis"])], _config(), today=TODAY)
    assert result.praise_topics == []


# ---------------------------------------------------------------------------
# cok fixture — mock etiketleriyle uçtan uca
# ---------------------------------------------------------------------------


def test_cok_topics_density_and_ranges():
    data = _load("cok")
    tags = _mock_tags(data.reviews)
    result = aggregate(data.reviews, tags, _config(ALIASES), today=TODAY)

    # Mock sözlüğü bu konuları üretir; alias ile servis'e birleşir.
    names = {cluster.name for cluster in result.praise_topics + result.complaint_topics}
    assert {"kahve", "servis", "fiyat"} <= names

    review_by_id = {review.id: review for review in data.reviews}
    assert result.praise_topics, "cok verisinde övgü konusu oluşmalı"
    assert sum(c.recent_count for c in result.praise_topics) > 0

    for cluster in result.praise_topics + result.complaint_topics:
        assert cluster.review_count == len(cluster.review_ids)
        assert cluster.review_count == len(set(cluster.review_ids))
        assert cluster.strength == ("strong" if cluster.review_count >= 3 else "watch")
        dates = [
            review_by_id[rid].date
            for rid in cluster.review_ids
            if review_by_id[rid].date is not None
        ]
        assert cluster.date_start == min(dates)
        assert cluster.date_end == max(dates)
        assert {item.id for item in cluster.evidence_reviews} == set(cluster.review_ids)

    servis = next(c for c in result.praise_topics if c.name == "servis")
    assert servis.review_count == len(servis.review_ids)
    assert servis.date_start <= servis.date_end
    assert servis.recent_count > 0


def test_cok_topics_sorted_by_count_desc_then_name():
    data = _load("cok")
    tags = _mock_tags(data.reviews)
    result = aggregate(data.reviews, tags, _config(ALIASES), today=TODAY)
    for clusters in (result.praise_topics, result.complaint_topics):
        keys = [(-c.review_count, c.name.casefold()) for c in clusters]
        assert keys == sorted(keys)


def test_cok_products_praised_shape():
    data = _load("cok")
    tags = _mock_tags(data.reviews)
    result = aggregate(data.reviews, tags, _config(ALIASES), today=TODAY)
    assert result.products_praised
    for product in result.products_praised:
        assert product.review_ids == sorted(set(product.review_ids))
        assert product.review_count == len(product.review_ids)
        assert product.average_stars is not None


def test_cok_unanswered_sorted():
    data = _load("cok")
    tags = _mock_tags(data.reviews)
    result = aggregate(data.reviews, tags, _config(ALIASES), today=TODAY)
    unanswered = result.unanswered_list
    assert unanswered
    assert all(not review.answered for review in data.reviews if review.id == unanswered[0].id)
    keys = [
        (row.stars, -(row.date.toordinal() if row.date else 1), row.id)
        for row in unanswered
    ]
    assert keys == sorted(keys)


# ---------------------------------------------------------------------------
# Determinizm ve dil
# ---------------------------------------------------------------------------


def test_determinism_identical_json():
    data = _load("cok")
    tags = _mock_tags(data.reviews)
    config = _config(ALIASES)
    first = aggregate(data.reviews, tags, config, today=TODAY)
    second = aggregate(data.reviews, tags, config, today=TODAY)
    assert isinstance(first, Aggregated)
    assert first.model_dump_json() == second.model_dump_json()


def test_lang_does_not_change_numbers():
    data = _load("cok")
    tags = _mock_tags(data.reviews)
    config = _config(ALIASES)
    tr = aggregate(data.reviews, tags, config, lang="tr", today=TODAY)
    en = aggregate(data.reviews, tags, config, lang="en", today=TODAY)
    assert tr.model_dump_json() == en.model_dump_json()


def test_empty_input_returns_empty_lists():
    result = aggregate([], [], _config(), today=TODAY)
    assert result == Aggregated()
