"""`rapor.pipeline.validate` testleri (plan §5-E, §9).

Kurallar: alıntı birebirlik (NFKC + casefold + boşluk/noktalama normalizasyonu),
15 kelime sınırı, id varlığı, boş review_ids, sayı tutarlılığı, top_quotes,
blok gizleme + uyarı + oran.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from rapor.normalize import normalize
from rapor.pipeline.validate import (
    MAX_QUOTE_WORDS,
    BlockValidation,
    ValidationResult,
    normalize_quote,
    validate_report,
)
from rapor.prompts import write_system, write_user
from rapor.providers import mock
from rapor.schemas import WriteResult

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"

REVIEWS: list[dict[str, Any]] = [
    {
        "id": "r1",
        "text": "Kahve harika, servis çok hızlı ve personel güler yüzlü.",
        "stars": 5.0,
        "month": "2026-01",
        "answered": True,
    },
    {
        "id": "r2",
        "text": "Servis yavaştı; garson ilgilenmedi, fiyat da yüksekti.",
        "stars": 2.0,
        "month": "2026-02",
        "answered": False,
    },
    {
        "id": "r3",
        "text": (
            "Bu mekan hafta sonu kalabalık olsa da kahve her zaman taze ve "
            "servis genelde hızlı çalışıyor gerçekten memnun kaldık"
        ),
        "stars": 4.0,
        "month": "2026-03",
        "answered": False,
    },
]

METRICS: dict[str, Any] = {
    "total_reviews": 5,
    "star_distribution": {"1": 0, "2": 1, "3": 0, "4": 1, "5": 3},
    "average_stars": 4.3,
    "positive_ratio": 0.6,
    "recent_90d": {"count": 3, "avg": 4.1},
    "responded_count": 2,
    "unanswered_count": 3,
    "response_rate": 0.4,
    "score": 82.0,
}

INSIGHTS: dict[str, Any] = {
    "band_label": "İyi",
    "verdict": (
        "İyi — müşteriler genel olarak memnun; son 3 ayda ortalama puan "
        "0,4 yıldız geriledi."
    ),
    "trend": "Son 3 ayda ortalama puan 0,4 yıldız geriledi.",
}

AGGREGATED: dict[str, Any] = {
    "praise_topics": [
        {
            "name": "kahve",
            "review_count": 1,
            "review_ids": ["r1"],
            "evidence_reviews": [REVIEWS[0]],
        }
    ],
    "complaint_topics": [
        {
            "name": "servis",
            "review_count": 1,
            "review_ids": ["r2"],
            "evidence_reviews": [REVIEWS[1]],
        }
    ],
    "products_praised": [],
    "unanswered_list": [],
}


def _payload() -> dict[str, Any]:
    return {
        "themes_praise": [
            {
                "name": "kahve",
                "review_ids": ["r1"],
                "quote_review_id": "r1",
                "quote": "Kahve harika, servis çok hızlı",
            }
        ],
        "themes_complaint": [
            {
                "name": "servis",
                "review_ids": ["r2"],
                "quote_review_id": "r2",
                "quote": "Servis yavaştı; garson ilgilenmedi",
                "reply_draft": "Geri bildiriminiz için teşekkür ederiz.",
            }
        ],
        "products_praised": [{"name": "kahve", "review_ids": ["r1"]}],
        "instagram_caption": "Bu hafta kahve için güzel sözler aldık.",
        "top_quotes": [{"quote": "Servis yavaştı", "review_id": "r2"}],
        "single_step": {
            "action": "Servis akışını bu hafta gözden geçirin.",
            "reason": "Yorumlarda servis öne çıkıyor.",
            "evidence_review_ids": ["r2"],
            "effort": "1–2 saat",
            "how_to_measure": "Sonraki haftalarda servis yorumlarını izleyin.",
        },
        "unanswered_reply_drafts": [
            {"review_id": "r2", "reply": "Yorumunuz için teşekkür ederiz."}
        ],
    }


def _run(payload: dict[str, Any] | WriteResult) -> ValidationResult:
    return validate_report(payload, REVIEWS, METRICS, INSIGHTS, AGGREGATED)


def _block(result: ValidationResult, prefix: str) -> BlockValidation:
    for block in result.blocks:
        if block.block.startswith(prefix):
            return block
    raise AssertionError(f"blok yok: {prefix} ({[b.block for b in result.blocks]})")


# ---------------------------------------------------------------------------


def test_valid_payload_passes_every_block():
    result = _run(_payload())

    assert result.schema_valid is True
    assert result.valid is True
    assert result.hidden_blocks == []
    assert result.warnings == []
    assert result.valid_blocks == result.total_blocks == 7
    assert result.ratio == 1.0
    assert all(block.ok for block in result.blocks)


def test_normalize_quote_collapses_case_space_and_punctuation():
    assert normalize_quote("  Kahve   HARİKA,! ") == normalize_quote("kahve harika")
    # İncelik: NFKC + casefold Türkçe İ'yi birleşik noktadan arındırır.
    assert "i" in normalize_quote("İyi")


def test_quote_passes_with_different_punctuation_and_whitespace():
    payload = _payload()
    payload["themes_praise"][0]["quote"] = "Kahve   harika servis çok hızlı!"

    result = _run(payload)

    assert _block(result, "theme_praise").ok is True
    assert result.valid is True


def test_quote_with_sixteen_words_is_rejected():
    words = REVIEWS[2]["text"].split()
    assert len(words) >= 16
    payload = _payload()
    payload["themes_praise"][0] = {
        "name": "kahve",
        "review_ids": ["r3"],
        "quote_review_id": "r3",
        "quote": " ".join(words[: MAX_QUOTE_WORDS + 1]),
    }

    result = _run(payload)

    block = _block(result, "theme_praise")
    assert block.ok is False
    assert "16 kelime" in (block.reason or "")
    assert block.block in result.hidden_blocks


def test_quote_with_fifteen_words_is_accepted():
    words = REVIEWS[2]["text"].split()
    payload = _payload()
    payload["themes_praise"][0] = {
        "name": "kahve",
        "review_ids": ["r3"],
        "quote_review_id": "r3",
        "quote": " ".join(words[:MAX_QUOTE_WORDS]),
    }

    result = _run(payload)

    assert _block(result, "theme_praise").ok is True


def test_quote_not_in_source_is_rejected():
    payload = _payload()
    payload["themes_praise"][0]["quote"] = "Kahve buz gibiydi"

    result = _run(payload)

    block = _block(result, "theme_praise")
    assert block.ok is False
    assert "birebir" in (block.reason or "")
    assert result.valid is False


def test_unknown_review_id_is_rejected():
    payload = _payload()
    payload["themes_praise"][0]["review_ids"] = ["hayalet"]
    payload["themes_complaint"][0]["quote_review_id"] = "hayalet"

    result = _run(payload)

    praise = _block(result, "theme_praise")
    complaint = _block(result, "theme_complaint")
    assert praise.ok is False and "bilinmeyen review_id" in (praise.reason or "")
    assert complaint.ok is False
    assert "bilinmeyen alıntı review_id" in (complaint.reason or "")


def test_empty_review_ids_fails_schema():
    payload = _payload()
    payload["themes_praise"][0]["review_ids"] = []

    result = _run(payload)

    assert result.schema_valid is False
    assert result.valid is False
    assert result.ratio == 0.0
    assert any("şema" in warning for warning in result.warnings)


def test_out_of_set_number_hides_block():
    payload = _payload()
    payload["themes_complaint"][0]["reply_draft"] = (
        "48 saat içinde size dönüş yapacağız."
    )

    result = _run(payload)

    block = _block(result, "theme_complaint")
    assert block.ok is False
    assert "küme dışı sayı" in (block.reason or "")
    assert "48" in (block.reason or "")
    assert block.block in result.hidden_blocks
    assert any("48" in warning for warning in result.warnings)


def test_numbers_present_in_metrics_or_insights_are_allowed():
    payload = _payload()
    payload["instagram_caption"] = (
        "Toplam 5 yorumda 4,3 ortalama ve %60 olumlu oran; skor 82."
    )

    result = _run(payload)

    assert _block(result, "instagram_caption").ok is True
    assert result.valid is True


def test_top_quotes_check_id_and_verbatim_text():
    payload = _payload()
    payload["top_quotes"] = [
        {"quote": "Servis yavaştı", "review_id": "hayalet"},
        {"quote": "Bu cümle kaynakta yok", "review_id": "r1"},
    ]

    result = _run(payload)

    block = _block(result, "top_quotes")
    assert block.ok is False
    assert "bilinmeyen review_id" in (block.reason or "")
    assert "birebir" in (block.reason or "")
    assert "top_quotes" in result.hidden_blocks


def test_failed_block_is_hidden_with_warning_and_ratio_drops():
    payload = _payload()
    payload["top_quotes"] = [{"quote": "Kaynakta olmayan alıntı", "review_id": "r1"}]

    result = _run(payload)

    assert result.total_blocks == 7
    assert result.valid_blocks == 6
    assert result.ratio == pytest.approx(6 / 7, rel=1e-4)
    assert result.hidden_blocks == ["top_quotes"]
    assert len(result.warnings) == 1
    assert result.warnings[0].startswith("top_quotes:")
    assert result.valid is False


# ---------------------------------------------------------------------------
# Mock write çıktısı uçtan uca doğrulamadan geçer
# ---------------------------------------------------------------------------


def test_mock_write_output_validates_verbatim():
    data = normalize(json.loads((FIXTURES / "cok.json").read_text(encoding="utf-8")))
    records = [
        {
            "id": review.id,
            "text": review.text,
            "stars": review.stars,
            "month": review.month,
            "answered": review.answered,
        }
        for review in data.reviews[:30]
    ]
    metrics = {"total_reviews": 30, "average_stars": 4.3, "score": 82.0}
    aggregate_payload = {
        "metrics": metrics,
        "insights": {},
        "topics": {"praise_topics": [], "complaint_topics": []},
    }
    generated = mock.generate(
        profile={"name": "mock", "adapter": "mock", "model": "mock-1"},
        system=write_system("tr"),
        user=write_user(aggregate_payload, records, "tr"),
        schema=None,
        thinking="medium",
        max_tokens=4096,
        api_key=None,
    )

    write = WriteResult.model_validate(generated.data)
    result = validate_report(write, records, metrics, {}, {})

    assert result.valid is True
    assert result.schema_valid is True
    assert result.hidden_blocks == []
    assert result.ratio == 1.0

    texts = {record["id"]: record["text"] for record in records}
    for theme in write.themes_praise + write.themes_complaint:
        assert texts[theme.quote_review_id].startswith(theme.quote)
    for quote in write.top_quotes:
        assert texts[quote.review_id].startswith(quote.quote)
