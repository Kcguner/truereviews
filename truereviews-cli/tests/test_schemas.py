"""`rapor/schemas.py` sözleşme testleri (plan §5-D, §5-E, §3)."""

from __future__ import annotations

import datetime as dt
import copy

import pytest
from pydantic import ValidationError

from rapor.schemas import (
    GEMINI_MINIMAL_REJECTED_MODELS,
    Place,
    Review,
    TagItem,
    WriteResult,
)


def valid_write_payload() -> dict:
    return {
        "themes_praise": [
            {
                "name": "lezzet",
                "review_ids": ["r1", "r2"],
                "quote_review_id": "r1",
                "quote": "Cheesecake harikaydı.",
            }
        ],
        "themes_complaint": [
            {
                "name": "servis",
                "review_ids": ["r3"],
                "quote_review_id": "r3",
                "quote": "Servis çok yavaştı.",
                "reply_draft": "Geri bildiriminiz için teşekkürler, ekibi bilgilendirdik.",
            }
        ],
        "products_praised": [{"name": "cheesecake", "review_ids": ["r1"]}],
        "instagram_caption": "Bu hafta cheesecake molası.",
        "top_quotes": [{"quote": "Cheesecake harikaydı.", "review_id": "r1"}],
        "single_step": {
            "action": "Hafta sonu için bir kişi daha çalıştırın.",
            "reason": "Servis şikayetleri hafta sonuna yığılıyor.",
            "evidence_review_ids": ["r3"],
            "effort": "Düşük",
            "how_to_measure": "Servis konulu şikayet sayısı.",
        },
        "unanswered_reply_drafts": [
            {"review_id": "r3", "reply": "Teşekkürler, düzeltiyoruz."}
        ],
    }


# --- Place / Review -------------------------------------------------------


def test_place_minimal_and_defaults():
    place = Place(title="Örnek Pasta & Cafe")
    assert place.title == "Örnek Pasta & Cafe"
    assert place.total_score is None
    assert place.reviews_count is None
    assert place.category is None


def test_review_defaults_and_date():
    review = Review(
        id="r1",
        text="Harika",
        stars=2.5,
        date=dt.date(2026, 9, 14),
        month="2026-09",
    )
    assert review.stars == 2.5  # 0.1 hassasiyet korunur
    assert review.answered is False
    assert review.image_count == 0
    assert review.detailed_ratings == {}
    assert review.context == {}
    assert review.language is None


def test_review_mutable_defaults_are_isolated():
    first = Review(id="r1", text="a", stars=5, month="2026-01")
    second = Review(id="r2", text="b", stars=4, month="2026-02")
    first.detailed_ratings["yemek"] = 5.0
    assert second.detailed_ratings == {}


# --- TagItem --------------------------------------------------------------


def test_tag_item_valid():
    item = TagItem(
        id="r1", sentiment="positive", topics=["lezzet"], products=["cheesecake"], severity=3
    )
    assert item.severity == 3


@pytest.mark.parametrize("sentiment", ["good", "", "POSITIVE", "mixed"])
def test_tag_item_rejects_bad_sentiment(sentiment):
    with pytest.raises(ValidationError):
        TagItem(id="r1", sentiment=sentiment, severity=1)


@pytest.mark.parametrize("severity", [0, 4, -1, 10])
def test_tag_item_rejects_severity_out_of_range(severity):
    with pytest.raises(ValidationError):
        TagItem(id="r1", sentiment="negative", severity=severity)


# --- WriteResult ----------------------------------------------------------


def test_write_result_valid_roundtrip():
    result = WriteResult.model_validate(valid_write_payload())
    assert result.themes_praise[0].name == "lezzet"
    assert result.themes_complaint[0].reply_draft
    assert result.single_step.action.startswith("Hafta sonu")
    # dict benzeri erişim de çalışır (pipeline uyumu)
    assert result.themes_complaint[0]["name"] == "servis"
    assert dict(result.top_quotes[0]) == {
        "quote": "Cheesecake harikaydı.",
        "review_id": "r1",
    }
    dumped = result.to_dict()
    assert dumped["single_step"]["evidence_review_ids"] == ["r3"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload["themes_praise"][0].update({"review_ids": []}),
        lambda payload: payload["themes_complaint"][0].update({"review_ids": []}),
        lambda payload: payload["products_praised"][0].update({"review_ids": []}),
        lambda payload: payload["single_step"].update({"evidence_review_ids": []}),
    ],
    ids=["praise-ids", "complaint-ids", "product-ids", "evidence-ids"],
)
def test_write_result_rejects_empty_review_ids(mutate):
    payload = valid_write_payload()
    mutate(payload)
    with pytest.raises(ValidationError):
        WriteResult.model_validate(payload)


@pytest.mark.parametrize(
    "drop",
    [
        ("themes_praise", "quote_review_id"),
        ("themes_complaint", "reply_draft"),
        ("single_step", "how_to_measure"),
        ("unanswered_reply_drafts", "reply"),
    ],
)
def test_write_result_rejects_missing_nested_key(drop):
    section, key = drop
    payload = valid_write_payload()
    if isinstance(payload[section], list):
        del payload[section][0][key]
    else:
        del payload[section][key]
    with pytest.raises(ValidationError):
        WriteResult.model_validate(payload)


@pytest.mark.parametrize(
    "section",
    [
        "themes_praise",
        "themes_complaint",
        "products_praised",
        "instagram_caption",
        "top_quotes",
        "single_step",
        "unanswered_reply_drafts",
    ],
)
def test_write_result_rejects_missing_top_level_key(section):
    payload = copy.deepcopy(valid_write_payload())
    del payload[section]
    with pytest.raises(ValidationError):
        WriteResult.model_validate(payload)


def test_write_result_rejects_unknown_sentiment_like_value():
    payload = valid_write_payload()
    payload["themes_praise"] = "not-a-list"
    with pytest.raises(ValidationError):
        WriteResult.model_validate(payload)


# --- Gemini sabiti --------------------------------------------------------


def test_gemini_minimal_rejected_models_contains_flash():
    assert "gemini-3.8-flash" in GEMINI_MINIMAL_REJECTED_MODELS
