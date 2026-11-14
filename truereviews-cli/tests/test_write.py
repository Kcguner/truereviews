"""`rapor.pipeline.write` testleri (plan §5-D, §9).

Mock adaptör ağ kullanmaz; sentetik metrics/insights/aggregated girdileri
fixture yorumlarından bağımsız kurulur. Alıntı birebirliği ve sayı kuralları
`tests/test_validate.py`'de ayrıntılı sınanır; burada D adımının sözleşmesi
(WriteResult, dil, retry, usage) doğrulanır.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from rapor.config import DEFAULT_BANDS, DEFAULT_FIELD_MAP, Config
from rapor.normalize import normalize
from rapor.pipeline.aggregate import aggregate
from rapor.pipeline import write as write_module
from rapor.pipeline.insights import compute_insights
from rapor.pipeline.metrics import compute_metrics
from rapor.pipeline.write import WriteError, write_report
from rapor.schemas import TagItem, WriteResult

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"
TODAY = datetime.date(2026, 11, 14)

_TOPIC_WORDS = ("kahve", "servis", "temizlik", "fiyat", "tatlı", "müzik")


def _config(lang_profile: str = "mock") -> Config:
    return Config.model_validate(
        {
            "providers": {
                lang_profile: {
                    "name": lang_profile,
                    "adapter": "mock",
                    "model": "mock-1",
                }
            },
            "steps": {
                "tag": {"profile": lang_profile},
                "write": {"profile": lang_profile},
            },
            "field_map": DEFAULT_FIELD_MAP,
            "bands": [dict(band) for band in DEFAULT_BANDS],
            "topic_aliases": {"servis": ["garson"]},
        }
    )


def _reviews(limit: int = 30):
    data = normalize(json.loads((FIXTURES / "cok.json").read_text(encoding="utf-8")))
    reviews = list(data.reviews[:22])
    low = [review for review in data.reviews if review.stars <= 2][:8]
    reviews.extend(low)
    return reviews[:limit]


def _tags(reviews) -> list[TagItem]:
    tags: list[TagItem] = []
    for review in reviews:
        lowered = review.text.casefold()
        topics = [word for word in _TOPIC_WORDS if word in lowered]
        sentiment = (
            "positive" if review.stars >= 4 else "negative" if review.stars <= 2 else "neutral"
        )
        severity = 3 if review.stars <= 1 else 2 if review.stars <= 2 else 1
        tags.append(
            TagItem(
                id=review.id,
                sentiment=sentiment,
                topics=topics,
                products=topics,
                severity=severity,
            )
        )
    return tags


def _inputs(reviews, config: Config):
    metrics = compute_metrics(None, reviews, config, today=TODAY)
    insights = compute_insights(metrics, reviews, config, lang="tr", today=TODAY)
    aggregated = aggregate(reviews, _tags(reviews), config, today=TODAY)
    return metrics, insights, aggregated


def _golden_payload() -> dict:
    """Geçerli WriteResult sözlüğü (retry testinde ikinci yanıt)."""
    return {
        "themes_praise": [
            {
                "name": "kahve",
                "review_ids": ["r1"],
                "quote_review_id": "r1",
                "quote": "Kahve harika",
            }
        ],
        "themes_complaint": [
            {
                "name": "servis",
                "review_ids": ["r2"],
                "quote_review_id": "r2",
                "quote": "Servis yavaştı",
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


@pytest.fixture
def out_dir(tmp_path):
    directory = tmp_path / "out" / "ornek-mekan"
    directory.mkdir(parents=True)
    return directory


def test_write_report_returns_valid_write_result(out_dir):
    reviews = _reviews()
    config = _config()
    metrics, insights, aggregated = _inputs(reviews, config)

    result = write_report(
        metrics,
        insights,
        aggregated,
        reviews,
        config,
        out_dir,
        use_cache=False,
    )

    assert isinstance(result, WriteResult)
    assert result.themes_praise
    assert result.single_step.evidence_review_ids
    assert (out_dir / "usage.json").is_file()


def test_write_report_quotes_come_from_evidence_text(out_dir):
    reviews = _reviews()
    config = _config()
    metrics, insights, aggregated = _inputs(reviews, config)

    result = write_report(
        metrics, insights, aggregated, reviews, config, out_dir, use_cache=False
    )

    texts = {review.id: review.text for review in reviews}
    quotes = [(theme.quote, theme.quote_review_id) for theme in result.themes_praise]
    quotes += [
        (theme.quote, theme.quote_review_id) for theme in result.themes_complaint
    ]
    quotes += [(quote.quote, quote.review_id) for quote in result.top_quotes]
    assert quotes
    for quote, review_id in quotes:
        assert texts[review_id].startswith(quote)
        assert len(quote.split()) <= 15


@pytest.mark.parametrize("lang", ["tr", "en"])
def test_write_report_uses_report_language(monkeypatch, out_dir, lang):
    reviews = _reviews()
    config = _config()
    metrics, insights, aggregated = _inputs(reviews, config)

    captured: dict[str, str] = {}
    original = write_module.generate_json

    def spy(profile, system, user, schema=None, **kwargs):
        captured["system"] = system
        captured["user"] = user
        return original(profile, system, user, schema, **kwargs)

    monkeypatch.setattr(write_module, "generate_json", spy)

    result = write_report(
        metrics, insights, aggregated, reviews, config, out_dir,
        lang=lang, use_cache=False,
    )

    assert isinstance(result, WriteResult)
    if lang == "en":
        assert "You are an editor" in captured["system"]
        assert "Below are the computed data" in captured["user"]
    else:
        assert "Sen bir mekan sahibi" in captured["system"]
        assert "Aşağıda hesaplanmış veriler" in captured["user"]


def test_write_report_retries_once_on_invalid_schema(monkeypatch, out_dir):
    reviews = _reviews()
    config = _config()
    metrics, insights, aggregated = _inputs(reviews, config)

    responses = [
        SimpleNamespace(data={"themes_praise": []}),  # eksik zorunlu alanlar
        SimpleNamespace(data=_golden_payload()),
    ]
    calls: list[str] = []

    def fake_generate(profile, system, user, schema=None, **kwargs):
        calls.append(user)
        return responses[len(calls) - 1]

    monkeypatch.setattr(write_module, "generate_json", fake_generate)

    result = write_report(
        metrics, insights, aggregated, reviews, config, out_dir, use_cache=False
    )

    assert isinstance(result, WriteResult)
    assert len(calls) == 2
    assert calls[0] != calls[1]  # düzeltme notu ile yeniden denendi


def test_write_report_raises_after_two_invalid_attempts(monkeypatch, out_dir):
    reviews = _reviews()
    config = _config()
    metrics, insights, aggregated = _inputs(reviews, config)

    monkeypatch.setattr(
        write_module,
        "generate_json",
        lambda *args, **kwargs: SimpleNamespace(data={"broken": True}),
    )

    with pytest.raises(WriteError):
        write_report(
            metrics, insights, aggregated, reviews, config, out_dir, use_cache=False
        )


def test_write_result_schema_is_round_trippable():
    payload = _golden_payload()
    write = WriteResult.model_validate(payload)
    assert write.to_dict()["themes_praise"][0]["quote"] == "Kahve harika"
    with pytest.raises(ValidationError):
        WriteResult.model_validate(
            {**payload, "themes_praise": [{**payload["themes_praise"][0], "review_ids": []}]}
        )
