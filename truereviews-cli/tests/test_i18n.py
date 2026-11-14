"""`rapor.pdf.i18n` testleri — plan §6, TR/EN metin sözleşmesi."""

from __future__ import annotations

import string
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rapor.pdf.i18n import (  # noqa: E402
    KEYS,
    PLACEHOLDERS,
    TEXTS,
    fmt_num,
    month_label,
    t,
)

LANGS = ("tr", "en")

# Her placeholder için örnek değer; anahtar taraması bunlarla doldurur.
SAMPLE_KWARGS = {
    "date": "14 Kasım 2026",
    "n": 12,
    "start": "Oca 2026",
    "end": "Kas 2026",
    "page": 1,
    "total": 2,
    "items": "Cheesecake, Latte",
    "responded": 12,
    "avg": "2,2",
    "unanswered": 52,
}


def _placeholders(template: str) -> set[str]:
    return {
        field
        for _, field, _, _ in string.Formatter().parse(template)
        if field
    }


def test_keys_nonempty() -> None:
    assert len(KEYS) > 20
    assert len(set(KEYS)) == len(KEYS)


def test_every_key_in_both_langs() -> None:
    for key in KEYS:
        assert key in TEXTS
        assert set(TEXTS[key]) == set(LANGS), key
        for lang in LANGS:
            assert TEXTS[key][lang].strip(), (key, lang)


def test_sample_kwargs_cover_every_placeholder() -> None:
    assert set(PLACEHOLDERS) <= set(SAMPLE_KWARGS), (
        set(PLACEHOLDERS) - set(SAMPLE_KWARGS)
    )


def test_every_key_formats_in_both_langs() -> None:
    for key in KEYS:
        for lang in LANGS:
            template = TEXTS[key][lang]
            needed = _placeholders(template)
            kwargs = {name: SAMPLE_KWARGS[name] for name in needed}
            text = t(lang, key, **kwargs)
            assert "{" not in text and "}" not in text, (key, lang, text)


def test_scope_line_tr() -> None:
    text = t("tr", "scope_line", start="Oca 2026", end="Kas 2026", n=64)
    assert text == (
        "Google Maps · Oca 2026 – Kas 2026 arasındaki 64 yorumun tamamı okundu"
    )


def test_scope_line_en() -> None:
    text = t("en", "scope_line", start="Jan 2026", end="Nov 2026", n=64)
    assert text == (
        "Google Maps · all 64 reviews from Jan 2026 to Nov 2026 were read"
    )


def test_header_and_sections() -> None:
    assert t("tr", "header_brand") == "TrueReviews · Kişisel Rapor"
    assert t("en", "header_brand") == "TrueReviews · Personal Report"
    assert t("tr", "header_date", date="14 Kasım 2026") == (
        "Rapor tarihi: 14 Kasım 2026"
    )
    assert t("en", "header_date", date="14 Nov 2026") == (
        "Report date: 14 Nov 2026"
    )
    assert t("tr", "section_overview") == "1 · Genel görünüm"
    assert t("en", "section_single_step") == "5 · Your one step this week"


def test_month_label_all_months() -> None:
    tr = ["Oca", "Şub", "Mar", "Nis", "May", "Haz",
          "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
    en = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for index, (tr_name, en_name) in enumerate(zip(tr, en), start=1):
        month = f"2026-{index:02d}"
        assert month_label("tr", month) == f"{tr_name} 2026"
        assert month_label("en", month) == f"{en_name} 2026"


def test_month_label_invalid_returns_input() -> None:
    assert month_label("tr", "bilinmeyen") == "bilinmeyen"
    assert month_label("en", "2026-13") == "2026-13"


def test_fmt_num() -> None:
    assert fmt_num("tr", 1.1) == "1,1"
    assert fmt_num("en", 1.1) == "1.1"
    assert fmt_num("tr", 4.0) == "4,0"
    assert fmt_num("en", 4.0, 0) == "4"
    assert fmt_num("tr", 1234.5) == "1.234,5"
    assert fmt_num("en", 1234.5) == "1,234.5"
    assert fmt_num("tr", 82, 0) == "82"


def test_lang_fallback_to_tr() -> None:
    assert t("", "header_brand") == "TrueReviews · Kişisel Rapor"
    assert t("de", "header_brand") == "TrueReviews · Kişisel Rapor"
    assert t("EN", "header_brand") == "TrueReviews · Personal Report"


def test_missing_key_raises_keyerror() -> None:
    with pytest.raises(KeyError):
        t("tr", "yok_boyle_anahtar")
    with pytest.raises(KeyError):
        t("en", "yok_boyle_anahtar")
