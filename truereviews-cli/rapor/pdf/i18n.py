"""Rapor metinleri — TR/EN (plan §6).

Her metin anahtarının iki dilde de karşılığı vardır. Eksik anahtar ``KeyError``
ile geliştiriciye döner; raporda boş kutu ya da "N/A" üretilmez.

Alıntı, verdict, trend ve anomali cümleleri buradan gelmez: onlar
``pipeline.insights`` ve ``pipeline.write`` çıktısıdır. Bu modül yalnızca sabit
arayüz metinlerini taşır.

Sayı biçimi `fmt_num`, ay etiketi `month_label` ile üretilir. TR ondalık
virgül ve binlik nokta; EN ondalık nokta ve binlik virgül kullanır.
"""

from __future__ import annotations

import string
from typing import Final

__all__ = [
    "KEYS",
    "PLACEHOLDERS",
    "TEXTS",
    "normalize_lang",
    "t",
    "month_label",
    "fmt_num",
]

_TR_MONTHS: Final[tuple[str, ...]] = (
    "Oca", "Şub", "Mar", "Nis", "May", "Haz",
    "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
)
_EN_MONTHS: Final[tuple[str, ...]] = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

TEXTS: Final[dict[str, dict[str, str]]] = {
    # 1 — üst çizgi
    "header_brand": {
        "tr": "TrueReviews · Kişisel Rapor",
        "en": "TrueReviews · Personal Report",
    },
    "header_date": {
        "tr": "Rapor tarihi: {date}",
        "en": "Report date: {date}",
    },
    # 2 — kapsam satırı
    "scope_line": {
        "tr": (
            "Google Maps · {start} – {end} arasındaki {n} yorumun tamamı "
            "okundu"
        ),
        "en": "Google Maps · all {n} reviews from {start} to {end} were read",
    },
    # 3 — beş kutu
    "stat_google_score": {"tr": "GOOGLE PUANI", "en": "GOOGLE RATING"},
    "stat_reviews_read": {"tr": "OKUNAN YORUM", "en": "REVIEWS READ"},
    "stat_recent_90d": {"tr": "SON 90 GÜN", "en": "LAST 90 DAYS"},
    "stat_response_rate": {"tr": "YANIT ORANI", "en": "RESPONSE RATE"},
    "stat_score": {"tr": "MEMNUNİYET SKORU", "en": "SATISFACTION SCORE"},
    "stat_google_sub": {"tr": "{n} yorum üzerinden", "en": "from {n} reviews"},
    "stat_read_sub": {"tr": "{start} – {end}", "en": "{start} – {end}"},
    "stat_recent_sub": {"tr": "son 3 ay", "en": "last 3 months"},
    "stat_response_sub": {
        "tr": "{responded} / {total}",
        "en": "{responded} / {total}",
    },
    "stat_score_sub": {"tr": "100 üzerinden", "en": "out of 100"},
    # 4 — bölüm başlıkları
    "section_overview": {"tr": "1 · Genel görünüm", "en": "1 · Overview"},
    "section_praise": {
        "tr": "2 · Müşteriler en çok neyi övüyor?",
        "en": "2 · What do customers praise most?",
    },
    "section_problems": {
        "tr": "3 · Nerede sorun var?",
        "en": "3 · Where are the problems?",
    },
    "section_unanswered": {
        "tr": "4 · Yanıtsız kalan yorumlar",
        "en": "4 · Unanswered reviews",
    },
    "section_single_step": {
        "tr": "5 · Bu hafta atacağınız tek adım",
        "en": "5 · Your one step this week",
    },
    # 4 — genel görünüm alt blokları
    "how_calculated": {"tr": "Nasıl hesaplandı?", "en": "How is it calculated?"},
    "star_distribution": {"tr": "Puan dağılımı", "en": "Rating distribution"},
    "service_ratings": {"tr": "Hizmet bazlı puan", "en": "Rating by service"},
    # 6 — övgü
    "topic_review_count": {
        "tr": "{n} yorumda geçiyor",
        "en": "mentioned in {n} reviews",
    },
    "top_products": {
        "tr": "En çok övülen ürünler: {items}",
        "en": "Most praised products: {items}",
    },
    "instagram_box": {
        "tr": "Bu hafta Instagram'da paylaşabilirsiniz:",
        "en": "You can share this on Instagram this week:",
    },
    # 7 — sorunlar
    "signal_intro": {
        "tr": (
            "Sinyal gücü: 3+ yorumda geçen konu 'güçlü', 1–2 yorumda geçen "
            "'izlenmeli'."
        ),
        "en": (
            "Signal strength: a topic in 3+ reviews is 'strong', in 1–2 "
            "reviews it is 'watch'."
        ),
    },
    "badge_strong": {"tr": "GÜÇLÜ SİNYAL · {n} yorum", "en": "STRONG SIGNAL · {n} reviews"},
    "badge_watch": {"tr": "İZLENMELİ · {n} yorum", "en": "WATCH · {n} reviews"},
    "draft_label": {"tr": "HAZIR YANIT TASLAĞI", "en": "READY REPLY DRAFT"},
    "card_meta": {
        "tr": "{start}–{end} arasında {n} yorum, ortalama {avg} ★",
        "en": "{n} reviews between {start} and {end}, average {avg} ★",
    },
    # 8 — yanıtsız tablosu
    "unanswered_intro": {
        "tr": "{unanswered} yorum yanıt bekliyor.",
        "en": "{unanswered} reviews are waiting for a reply.",
    },
    "table_score": {"tr": "PUAN", "en": "RATING"},
    "table_review": {"tr": "YORUM", "en": "REVIEW"},
    "table_draft": {"tr": "HAZIR YANIT TASLAĞI", "en": "READY REPLY DRAFT"},
    # 9 — tek adım
    "single_step_why": {"tr": "Neden:", "en": "Why:"},
    "single_step_effort": {"tr": "Emek:", "en": "Effort:"},
    "single_step_measure": {"tr": "Ölçüm:", "en": "Measurement:"},
    # 10 — yöntem notu
    "method_note": {
        "tr": (
            "Sayılar kodla hesaplandı; alıntılar yorumlardan birebir alındı "
            "ve gerekirse kısaltıldı; yorumcu adları raporda yer almaz."
        ),
        "en": (
            "Numbers were computed in code; quotes were taken verbatim from "
            "the reviews and shortened where needed; reviewer names do not "
            "appear in the report."
        ),
    },
    "footer_method_trace": {
        "tr": "Yöntem: sayılar kodla, alıntılar birebir.",
        "en": "Method: numbers from code, quotes verbatim.",
    },
    # 12 — demo ve sayfa numarası
    "demo_disclaimer": {
        "tr": "Bu sayfadaki mekan, yorumlar ve rakamlar örnek amaçlıdır.",
        "en": "The place, reviews and figures on this page are for demonstration purposes.",
    },
    "demo_watermark": {"tr": "ÖRNEK", "en": "SAMPLE"},
    "page_number": {"tr": "{page} / {total}", "en": "{page} / {total}"},
}

# Kanonik anahtar listesi (TR tanım sırası). Testler iki dilde eşitlik arar.
KEYS: Final[tuple[str, ...]] = tuple(TEXTS)


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------


def normalize_lang(lang: str) -> str:
    """``lang`` -> ``"tr"`` | ``"en"``. Bilinmeyen değer TR'ye düşer."""
    return "en" if (lang or "").strip().lower() == "en" else "tr"


def t(lang: str, key: str, **kwargs: object) -> str:
    """Rapor metni. Eksik anahtar ``KeyError`` fırlatır."""
    code = normalize_lang(lang)
    try:
        template = TEXTS[key][code]
    except KeyError:
        raise KeyError(f"Bilinmeyen i18n anahtarı: {key!r}") from None
    return template.format(**kwargs)


def month_label(lang: str, month: str) -> str:
    """``"2026-11"`` -> ``"Kas 2026"`` (TR) / ``"Nov 2026"`` (EN)."""
    try:
        year_text, month_text = month.split("-", 1)
        index = int(month_text) - 1
    except (AttributeError, ValueError):
        return month
    names = _EN_MONTHS if normalize_lang(lang) == "en" else _TR_MONTHS
    if not 0 <= index < 12:
        return month
    return f"{names[index]} {year_text}"


def fmt_num(lang: str, value: float, ndigits: int = 1) -> str:
    """Ondalık/binlik ayırıcı dile göre: TR ``1,1`` / EN ``1.1``.

    Args:
        lang: ``"tr"`` | ``"en"``.
        value: Sayı (int ya da float).
        ndigits: Ondalık basamak sayısı (varsayılan 1).
    """
    number = float(value)
    text = f"{number:,.{int(ndigits)}f}"
    if normalize_lang(lang) == "tr":
        text = text.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return text


# Placeholder taraması için: anahtarlarda geçebilecek alan adları.
PLACEHOLDERS: Final[tuple[str, ...]] = tuple(
    sorted(
        {
            field
            for pair in TEXTS.values()
            for template in pair.values()
            for _, field, _, _ in string.Formatter().parse(template)
            if field
        }
    )
)
