"""`rapor.normalize` testleri: puan paritesi, girdi biçimleri, gizlilik, tarih."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rapor.normalize import (  # noqa: E402
    NormalizeError,
    normalize,
    normalize_rating,
    parse_date,
)

FIXTURES = ROOT / "fixtures"


def _load(name: str) -> list[dict]:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def _place_record(**overrides) -> dict:
    record = {
        "title": "Test Kafe",
        "categoryName": "Kafe",
        "city": "İstanbul",
        "countryCode": "TR",
        "totalScore": 4.4,
        "reviewsCount": 120,
        "reviewId": "r1",
        "text": "Kahve güzeldi.",
        "stars": 5,
        "publishedAtDate": "2026-05-12T10:00:00.000Z",
    }
    record.update(overrides)
    return record


# ---------------------------------------------------------------------------
# normalize_rating — lib/apify.ts::normalizeRating birebir paritesi
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (0, 3.0),
        (-1, 3.0),
        (None, 3.0),
        ("abc", 3.0),
        ("", 3.0),
        (47, 3.0),
        (11, 3.0),
        (10, 5.0),
        (7, 5.0),
        (6, 5.0),
        (5, 5.0),
        (4.7, 4.7),
        (2.5, 2.5),
        (2.549, 2.5),
        (1, 1.0),
        ("4.4", 4.4),
        (True, 3.0),
    ],
)
def test_normalize_rating_parity(raw, expected):
    assert normalize_rating(raw) == expected


def test_normalize_rating_js_round_half_up():
    # JS Math.round .5'i +Infinity yönüne yuvarlar; Python round değil.
    assert normalize_rating(2.45) == 2.5
    assert normalize_rating(4.25) == 4.3


def test_normalize_rating_stays_in_one_to_five():
    for raw in (0.01, 0.04, 9.9, 10.0, 5.04):
        assert 1.0 <= normalize_rating(raw) <= 5.0


# ---------------------------------------------------------------------------
# Girdi biçimleri
# ---------------------------------------------------------------------------

def test_list_input_apify_dataset():
    data = normalize([_place_record(reviewId="a"), _place_record(reviewId="b", stars=2)])
    assert data.place.title == "Test Kafe"
    assert data.place.category == "Kafe"
    assert data.place.total_score == 4.4
    assert data.place.reviews_count == 120
    assert [r.id for r in data.reviews] == ["a", "b"]
    assert [r.stars for r in data.reviews] == [5.0, 2.0]


def test_dict_input_place_and_reviews():
    payload = {
        "place": {
            "title": "Sözlük Kafe",
            "categoryName": "Pastane",
            "city": "İzmir",
            "countryCode": "TR",
            "totalScore": 4.1,
            "reviewsCount": 44,
        },
        "reviews": [_place_record(reviewId="x")],
    }
    data = normalize(payload)
    assert data.place.title == "Sözlük Kafe"
    assert data.place.reviews_count == 44
    assert len(data.reviews) == 1


def test_list_input_nested_reviews_flattened():
    item = {**_place_record(reviews=[_place_record(reviewId="n1"), _place_record(reviewId="n2")])}
    data = normalize([item])
    assert [r.id for r in data.reviews] == ["n1", "n2"]


def test_stars_missing_defaults_to_neutral():
    record = _place_record()
    del record["stars"]
    data = normalize([record])
    assert data.reviews[0].stars == 3.0


# ---------------------------------------------------------------------------
# field_map
# ---------------------------------------------------------------------------

def test_custom_field_map():
    record = {
        "title": "Özel Kafe",
        "categoryName": "Kafe",
        "yorum": "Servis hızlıydı.",
        "puan": 4,
        "kimlik": "k1",
        "tarih": "2026-01-03",
        "cevap": "Teşekkürler.",
        "gorseller": ["a.jpg", "b.jpg"],
        "detay": {"Yemek": 4},
        "dil": "tr",
        "baglam": {"source": "Google"},
    }
    field_map = {
        "text": "yorum",
        "stars": "puan",
        "id": "kimlik",
        "date": "tarih",
        "owner_response": "cevap",
        "images": "gorseller",
        "detailed_ratings": "detay",
        "language": "dil",
        "context": "baglam",
    }
    review = normalize([record], field_map=field_map).reviews[0]
    assert review.id == "k1"
    assert review.text == "Servis hızlıydı."
    assert review.stars == 4.0
    assert review.date == date(2026, 1, 3)
    assert review.month == "2026-01"
    assert review.answered is True
    assert review.image_count == 2
    assert review.detailed_ratings == {"Yemek": 4.0}
    assert review.language == "tr"
    assert review.context == {"source": "Google"}


def test_missing_required_field_raises():
    record = _place_record()
    del record["reviewId"]
    with pytest.raises(NormalizeError, match="reviewId"):
        normalize([record])


def test_custom_field_map_source_missing_raises():
    record = _place_record()
    with pytest.raises(NormalizeError, match="yorum"):
        normalize([record], field_map={"text": "yorum"})


def test_unknown_field_map_key_raises():
    with pytest.raises(NormalizeError, match="bilinmeyen"):
        normalize([_place_record()], field_map={"bilinmeyen_alan": "x"})


# ---------------------------------------------------------------------------
# Türetilmiş alanlar
# ---------------------------------------------------------------------------

def test_image_count_from_urls():
    record = _place_record(reviewImageUrls=["u1", "u2", "u3"])
    assert normalize([record]).reviews[0].image_count == 3
    assert normalize([_place_record()]).reviews[0].image_count == 0


def test_answered_derived_from_owner_response():
    answered = normalize([_place_record(responseFromOwnerText="Teşekkürler.")]).reviews[0]
    assert answered.answered is True
    assert answered.owner_response == "Teşekkürler."

    empty = normalize([_place_record(responseFromOwnerText="   ")]).reviews[0]
    assert empty.answered is False
    assert empty.owner_response is None

    missing = normalize([_place_record()]).reviews[0]
    assert missing.answered is False
    assert missing.owner_response is None


def test_broken_date_becomes_none():
    review = normalize([_place_record(publishedAtDate="bozuk-tarih")]).reviews[0]
    assert review.date is None
    assert review.month == ""
    # Tarihsiz yorum listede kalır.
    assert review.id == "r1"


def test_missing_date_becomes_none():
    record = _place_record()
    del record["publishedAtDate"]
    review = normalize([record]).reviews[0]
    assert review.date is None
    assert review.month == ""


def test_valid_date_parsed():
    review = normalize([_place_record(publishedAtDate="2026-05-12T10:00:00.000Z")]).reviews[0]
    assert review.date == date(2026, 5, 12)
    assert review.month == "2026-05"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-05-12T10:00:00.000Z", date(2026, 5, 12)),
        ("2026-05-12", date(2026, 5, 12)),
        ("", None),
        (None, None),
        ("2026-13-40", None),
        ({"y": 1}, None),
    ],
)
def test_parse_date(raw, expected):
    assert parse_date(raw) == expected


# ---------------------------------------------------------------------------
# Gizlilik: isim / profil / URL Review'a taşınmaz
# ---------------------------------------------------------------------------

def test_reviewer_identity_not_carried():
    record = _place_record(
        name="Ayşe Y.",
        reviewerName="Ayşe Y.",
        reviewerUrl="https://www.google.com/maps/contrib/123",
        reviewUrl="https://www.google.com/maps/reviews/123",
        author="Ayşe Y.",
        profilePhotoUrl="https://example.com/face.jpg",
    )
    review = normalize([record]).reviews[0]
    dumped = review.model_dump()
    assert "name" not in dumped
    assert "reviewerName" not in dumped
    assert "reviewerUrl" not in dumped
    assert "reviewUrl" not in dumped
    assert "author" not in dumped
    assert "profilePhotoUrl" not in dumped
    assert set(dumped) == {
        "id",
        "text",
        "stars",
        "date",
        "month",
        "answered",
        "owner_response",
        "image_count",
        "detailed_ratings",
        "language",
        "context",
    }


def test_translated_text_never_used():
    record = _place_record(text="Orijinal yorum.", textTranslated="Translated review.")
    review = normalize([record]).reviews[0]
    assert review.text == "Orijinal yorum."


# ---------------------------------------------------------------------------
# Fixture sözleşmeleri
# ---------------------------------------------------------------------------

def test_fixture_counts_and_contracts():
    expected = {"az": 8, "cok": 120, "yanitsiz": 30, "altpuansiz": 25}
    for name, count in expected.items():
        data = normalize(_load(name))
        assert len(data.reviews) == count, name
        assert data.place.title, name
        ids = [r.id for r in data.reviews]
        assert len(set(ids)) == count, name
        assert all(1.0 <= r.stars <= 5.0 for r in data.reviews), name


def test_yanitsiz_has_zero_responses():
    data = normalize(_load("yanitsiz"))
    assert all(not r.answered for r in data.reviews)
    assert sum(1 for r in data.reviews if r.stars <= 2) >= 2


def test_altpuansiz_has_no_detailed_ratings():
    data = normalize(_load("altpuansiz"))
    assert all(r.detailed_ratings == {} for r in data.reviews)


def test_cok_has_response_and_topic_spread():
    data = normalize(_load("cok"))
    answered = sum(1 for r in data.reviews if r.answered)
    assert 0.30 <= answered / len(data.reviews) <= 0.50
    assert any(r.detailed_ratings for r in data.reviews)
    assert any(r.image_count > 0 for r in data.reviews)
    assert any(r.language == "en" for r in data.reviews)
    months = {r.month for r in data.reviews if r.month}
    assert len(months) == 18
