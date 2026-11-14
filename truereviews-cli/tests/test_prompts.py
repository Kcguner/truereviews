"""`rapor.prompts` testleri — plan §4, §5-B, §5-D."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rapor.normalize import normalize  # noqa: E402
from rapor.prompts import (  # noqa: E402
    LANG_NAMES,
    normalize_lang,
    tag_system,
    tag_user,
    write_system,
    write_user,
)

FIXTURES = ROOT / "fixtures"


def _reviews(name: str = "az"):
    data = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return normalize(data).reviews


# --- dil -------------------------------------------------------------------


def test_normalize_lang():
    assert normalize_lang("TR") == "tr"
    assert normalize_lang("en") == "en"
    assert normalize_lang(None) == "tr"
    with pytest.raises(ValueError):
        normalize_lang("de")


def test_lang_names():
    assert LANG_NAMES["tr"] == "Türkçe"
    assert LANG_NAMES["en"] == "English"


# --- tag promptları --------------------------------------------------------


def test_tag_system_tr_en_exist_and_differ():
    tr = tag_system("tr")
    en = tag_system("en")
    assert "Türkçe" in tr
    assert "English" in en
    assert tr != en
    # sentiment tanımı metne dayanır; çelişkide metin kazanır
    assert "METNİNE" in tr and "METİN kazanır" in tr
    assert "TEXT only" in en and "TEXT wins" in en
    for text in (tr, en):
        assert "sentiment" in text
        assert "severity" in text
        assert "topics" in text
        assert "JSON" in text


def test_tag_system_does_not_mention_write_task():
    """Mock adaptör görev tipini anahtar kelimeden ayırır: tag promptu write
    kelimesi taşımamalı, yoksa yanlış üretici çalışır."""
    for lang in ("tr", "en"):
        lowered = tag_system(lang).lower()
        for word in ("rapor", "taslak", "instagram", "write"):
            assert word not in lowered


def test_tag_user_privacy_only_allowed_fields():
    reviews = _reviews("az")
    extra = {
        "id": "r-extra",
        "text": "Cok memnun kaldi, tekrar gelecek.",
        "stars": 5,
        "month": "2026-01",
        "answered": False,
        "reviewer_name": "Gizli Kisi",
        "reviewer_profile": "https://example.com/profile/gizli",
        "review_image_urls": ["https://example.com/photo.jpg"],
    }
    prompt = tag_user([*reviews, extra], "tr")

    assert "Gizli Kisi" not in prompt
    assert "example.com" not in prompt
    assert "reviewer_name" not in prompt
    assert "profile" not in prompt
    assert "photo" not in prompt

    block = prompt.split("```json", 1)[1].split("```", 1)[0]
    payload = json.loads(block)
    assert len(payload) == len(reviews) + 1
    assert all(set(record) == {"id", "text", "stars", "month", "answered"} for record in payload)
    assert payload[-1]["id"] == "r-extra"


def test_tag_user_tr_en_and_mock_compatible():
    reviews = _reviews("az")
    tr = tag_user(reviews, "tr")
    en = tag_user(reviews, "en")
    assert tr != en
    assert "Etiketlenecek yorumlar" in tr
    assert "reviews to tag" in en
    # promptlar mock adaptörün 'etiket' anahtar kelimesiyle eşleşmeli
    assert "etiket" in tag_system("tr").lower()


# --- write promptları ------------------------------------------------------


def test_write_system_contains_all_d_rules_tr():
    text = write_system("tr")
    lowered = text.lower()
    assert "Türkçe" in text
    # sayı üretme
    assert "sayı üretme" in lowered
    # her iddiaya review_ids
    assert "review_ids" in text and "evidence_review_ids" in text
    # tek adım gerçekten tek ve ölçülebilir
    assert "tek adım" in lowered and "how_to_measure" in text
    # tek yorumluk şikayet kesin sorun değil
    assert "tek yorumluk şikayet kesin sorun değildir" in lowered
    # ton + klişe yok
    assert "klişe" in lowered and "dürüst" in lowered
    # taslak: mekan adına, kısa, tazminat/söz yok
    assert "mekan adına" in lowered and "tazminat" in lowered
    # isim içeren alıntı seçilmez; ad sansürlenmez, birebirlik bozulmaz
    assert "kişi adı geçen" in lowered
    assert "alıntı olarak seçme" in lowered
    assert "sansürleme" in lowered
    # alıntılar orijinal dilde, çeviri yok
    assert "orijinal dilde" in lowered and "çeviri yapma" in lowered


def test_write_system_contains_all_d_rules_en():
    text = write_system("en")
    lowered = text.lower()
    assert "English" in text
    assert "do not produce numbers" in lowered
    assert "review_ids" in text and "evidence_review_ids" in text
    assert "single step" in lowered and "how_to_measure" in text
    assert "single review is not a confirmed problem" in lowered
    assert "cliché" in lowered and "honest" in lowered
    assert "on behalf of the venue" in lowered and "compensation" in lowered
    assert "person's name" in lowered
    assert "do not censor" in lowered
    assert "original language" in lowered and "do not translate" in lowered


def test_write_user_embeds_aggregate_evidence_and_schema():
    reviews = _reviews("az")
    aggregate = {
        "metrics": {"average": 4.6, "count": 8},
        "themes": [{"name": "kahve", "review_ids": [reviews[0].id]}],
    }
    prompt = write_user(aggregate, reviews[:3], "tr")

    assert "hesaplanmış" in prompt.lower()
    assert '"average": 4.6' in prompt
    assert reviews[0].id in prompt
    for field in (
        "themes_praise",
        "themes_complaint",
        "products_praised",
        "instagram_caption",
        "top_quotes",
        "single_step",
        "unanswered_reply_drafts",
        "quote_review_id",
        "reply_draft",
        "how_to_measure",
    ):
        assert field in prompt

    # gizlilik: yalnızca izinli alanlar
    block = prompt.split("### Kanıt yorumları", 1)[1].split("```json", 1)[1].split("```", 1)[0]
    payload = json.loads(block)
    assert all(set(record) == {"id", "text", "stars", "month", "answered"} for record in payload)
    assert len(payload) == 3


def test_write_user_en():
    reviews = _reviews("az")
    prompt = write_user({"metrics": {"average": 4.6}}, reviews[:2], "en")
    assert "Computed data" in prompt
    assert "Evidence reviews" in prompt
    assert "Output skeleton" in prompt
