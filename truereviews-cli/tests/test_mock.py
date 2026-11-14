"""`rapor.providers.mock` testleri: determinizm, görev tipleri, şema uyumu."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from rapor.config import ProviderProfile
from rapor.normalize import normalize
from rapor.pipeline.validate import validate_report
from rapor.prompts import tag_system, tag_user, write_system, write_user
from rapor.providers import mock
from rapor.schemas import TagItem, WriteResult

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "cok.json"


def _profile() -> ProviderProfile:
    return ProviderProfile.model_validate(
        {"name": "mock-test", "adapter": "mock", "model": "mock-1"}
    )


def _run(system: str, user: str):
    return mock.generate(
        profile=_profile(),
        system=system,
        user=user,
        schema=None,
        thinking="low",
        max_tokens=4096,
        api_key=None,
    )


def _review_records(limit: int = 12) -> list[dict]:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    normalized = normalize(data)
    records = []
    for review in normalized.reviews[:limit]:
        records.append(
            {
                "id": review.id,
                "text": review.text,
                "stars": review.stars,
                "month": review.month,
                "answered": review.answered,
            }
        )
    return records


TAG_SYSTEM = "Yorumları etiketle: her yorum için sentiment, topics, products, severity üret."
WRITE_SYSTEM = "Mekan sahibi için rapor yaz. Konu kümelerini ve kanıt yorumlarını kullan."


def test_tag_output_is_deterministic():
    user = "Yorumlar:\n" + json.dumps({"reviews": _review_records(8)}, ensure_ascii=False)

    first = _run(TAG_SYSTEM, user)
    second = _run(TAG_SYSTEM, user)

    assert first.data == second.data
    assert json.dumps(first.data, ensure_ascii=False) == json.dumps(
        second.data, ensure_ascii=False
    )
    assert first.usage.input_tokens == second.usage.input_tokens
    assert first.usage.output_tokens == second.usage.output_tokens


def test_tag_items_validate_against_schema():
    records = _review_records()
    user = "Yorumlar:\n" + json.dumps({"reviews": records}, ensure_ascii=False)

    result = _run(TAG_SYSTEM, user)

    assert isinstance(result.data, list)
    items = [TagItem.model_validate(item) for item in result.data]
    assert len(items) == len(records)
    assert [item.id for item in items] == [record["id"] for record in records]


def test_tag_sentiment_and_severity_follow_stars():
    records = _review_records(20)
    user = "Yorumlar:\n" + json.dumps({"reviews": records}, ensure_ascii=False)

    result = _run(TAG_SYSTEM, user)

    by_id = {record["id"]: record for record in records}
    for item in result.data:
        stars = by_id[item["id"]]["stars"]
        if stars >= 4:
            assert item["sentiment"] == "positive"
        elif stars <= 2:
            assert item["sentiment"] == "negative"
        else:
            assert item["sentiment"] == "neutral"

        if item["sentiment"] == "negative":
            expected = 3 if stars <= 1 else 2 if stars <= 2 else 1
            assert item["severity"] == expected
        else:
            assert item["severity"] == 1


def test_tag_topics_come_from_review_text():
    records = [
        {
            "id": "r1",
            "text": "Kahve çok güzeldi ama servis yavaştı, fiyat da yüksek.",
            "stars": 3,
            "month": "2026-01",
            "answered": False,
        }
    ]
    user = json.dumps({"reviews": records}, ensure_ascii=False)

    result = _run(TAG_SYSTEM, user)

    assert result.data[0]["topics"] == ["kahve", "servis", "fiyat"]


def test_write_output_validates_and_quotes_are_verbatim_prefixes():
    records = _review_records(10)
    user = json.dumps(
        {
            "themes": [{"name": "kahve", "review_ids": [r["id"] for r in records[:3]]}],
            "reviews": records,
        },
        ensure_ascii=False,
    )

    result = _run(WRITE_SYSTEM, user)

    write = WriteResult.model_validate(result.data)
    texts = {record["id"]: record["text"] for record in records}
    ids = set(texts)

    quotes = [(theme.quote, theme.quote_review_id) for theme in write.themes_praise]
    quotes += [(theme.quote, theme.quote_review_id) for theme in write.themes_complaint]
    quotes += [(quote.quote, quote.review_id) for quote in write.top_quotes]
    assert quotes
    for quote, review_id in quotes:
        assert review_id in ids
        assert texts[review_id].startswith(quote)
        assert len(quote.split()) <= 15

    assert write.single_step.evidence_review_ids
    assert set(write.single_step.evidence_review_ids) <= ids


def test_write_has_complaint_and_unanswered_drafts():
    records = [
        {
            "id": "n1",
            "text": "Servis çok yavaştı, garson ilgilenmedi ve fiyat yüksekti.",
            "stars": 1,
            "month": "2026-02",
            "answered": False,
        },
        {
            "id": "p1",
            "text": "Kahve ve tatlı harikaydı, temizlik de çok iyiydi.",
            "stars": 5,
            "month": "2026-03",
            "answered": True,
        },
    ]
    user = json.dumps({"reviews": records}, ensure_ascii=False)

    result = _run(WRITE_SYSTEM, user)

    write = WriteResult.model_validate(result.data)
    assert [theme.name for theme in write.themes_praise] == ["kahve"]
    assert len(write.themes_complaint) == 1
    assert write.themes_complaint[0].name == "servis"
    assert write.themes_complaint[0].review_ids == ["n1"]
    assert [draft.review_id for draft in write.unanswered_reply_drafts] == ["n1"]
    assert write.top_quotes[0].review_id == "p1"


def test_write_without_records_raises():
    with pytest.raises(ValueError):
        _run(WRITE_SYSTEM, "Konu kümeleri var ama yorum kaydı yok.")


# ---------------------------------------------------------------------------
# Görev ayrımı: gerçek promptlarla TR/EN
# ---------------------------------------------------------------------------


def _real_tag_run(records: list[dict], lang: str):
    return _run(tag_system(lang), tag_user(records, lang))


def _real_write_run(records: list[dict], lang: str, metrics: dict | None = None):
    aggregate_payload = {
        "metrics": metrics or {"total_reviews": len(records), "score": 80.0},
        "insights": {},
        "topics": {"praise_topics": [], "complaint_topics": []},
    }
    return _run(write_system(lang), write_user(aggregate_payload, records, lang))


@pytest.mark.parametrize("lang", ["tr", "en"])
def test_real_tag_prompt_returns_tag_array(lang: str):
    """EN etiket promptu "Write only the JSON array." içerir; write'a kaymamalı."""
    records = _review_records(6)

    result = _real_tag_run(records, lang)

    assert isinstance(result.data, list), "tag promptu write nesnesi üretmemeli"
    items = [TagItem.model_validate(item) for item in result.data]
    assert [item.id for item in items] == [record["id"] for record in records]


@pytest.mark.parametrize("lang", ["tr", "en"])
def test_real_write_prompt_returns_write_object(lang: str):
    records = _review_records(6)

    result = _real_write_run(records, lang)

    assert isinstance(result.data, dict)
    write = WriteResult.model_validate(result.data)
    assert write.single_step.action


def test_en_tag_prompt_with_write_word_still_tags():
    """Daraltılmış kelime listesi: gövdedeki "write" tek başına write saymaz."""
    records = _review_records(4)
    system = tag_system("en")
    user = tag_user(records, "en")
    assert "write" in user.lower()  # kusurun kaynağı: bu sözcük promptta var

    assert mock._is_write_task(system, user) is False
    result = _run(system, user)
    assert isinstance(result.data, list)
    assert len(result.data) == len(records)


# ---------------------------------------------------------------------------
# Write çıktısındaki serbest metin sayıları girdiden türer
# ---------------------------------------------------------------------------


def test_write_free_text_numbers_stay_inside_allowed_set():
    """Küçük metrik kümesinde ("30 gün" gibi) küme dışı sayı kalmamalı.

    Doğrulama, metrics/insights/aggregated sayıları dışındaki her rakamı
    reddeder. Mock bu yüzden serbest metinde rakam üretmez; `single_step`
    gizlenmeden geçer.
    """
    records = _review_records(8)
    metrics = {
        "total_reviews": 8,
        "average_stars": 4.12,
        "score": 81.0,
    }

    result = _real_write_run(records, "tr", metrics)
    write = WriteResult.model_validate(result.data)

    # Serbest metinlerde rakam yok.
    for text in (
        write.instagram_caption,
        write.single_step.action,
        write.single_step.reason,
        write.single_step.effort,
        write.single_step.how_to_measure,
        *[theme.reply_draft for theme in write.themes_complaint],
        *[draft.reply for draft in write.unanswered_reply_drafts],
    ):
        assert not any(char.isdigit() for char in text), text

    validation = validate_report(write, records, metrics, {}, {})
    assert validation.hidden_blocks == []
    assert "single_step" not in validation.hidden_blocks
    assert validation.ratio == 1.0


def test_write_output_is_deterministic():
    records = _review_records(10)

    first = _real_write_run(records, "tr")
    second = _real_write_run(records, "tr")

    assert json.dumps(first.data, ensure_ascii=False) == json.dumps(
        second.data, ensure_ascii=False
    )
