"""Deterministik sahte model adaptörü (test ve uçtan uca pipeline geliştirme).

Ağ yok, rastgelelik yok: aynı girdi her zaman aynı `data` üretir. Girdi
metnindeki JSON bloklarından yorum kayıtlarını çıkarır; görev tipini sabit bir
öncelik sırasıyla ayırt eder (sistem metnindeki write şema işaretleri → etiket
işaretleri → daraltılmış anahtar kelimeler):

* **etiket/tag** → her yorum için `TagItem` biçiminde sözlük listesi.
* **rapor/write/taslak** → `WriteResult` şemasına uyan tek sözlük.

Pydantic doğrulaması burada yapılmaz (çağıran yapar); üretilen JSON şemalara
uymak zorundadır. `usage` alanları metin uzunluğundan tahmin edilir.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

from .base import AdapterResult, AdapterUsage

__all__ = [
    "TAG_KEYWORDS",
    "TAG_MARKERS",
    "WRITE_KEYWORDS",
    "WRITE_MARKERS",
    "generate",
]

# Görev tipini ayırt eden anahtar kelimeler (küçük harf karşılaştırılır).
# Öncelik sırası `_is_write_task` içinde: sistem metnindeki açık şema/görev
# işaretleri → etiket işaretleri → daraltılmış anahtar kelime taraması.
# "write" gibi genel sözcükler listede yoktur: EN etiket promptu "Write only the
# JSON array." cümlesiyle yanlışlıkla write moduna geçiyordu.
TAG_KEYWORDS: tuple[str, ...] = (
    "etiket",
    "tag",
    "sınıflandır",
    "siniflandir",
    "classify",
    "tagging",
    "sentiment",
)
WRITE_KEYWORDS: tuple[str, ...] = (
    "rapor",
    "yanıt taslağı",
    "yanit taslagi",
    "reply draft",
    "taslak",
    "instagram",
    "tek adım",
    "tek adim",
    "single_step",
    "themes_praise",
    "unanswered_reply_drafts",
)

# Sistem metninde geçerse görev kesin: write şemasının alan adları / tag görevi.
WRITE_MARKERS: tuple[str, ...] = (
    "themes_praise",
    "themes_complaint",
    "products_praised",
    "instagram_caption",
    "unanswered_reply_drafts",
    "single_step",
    "yanıt taslağı",
    "yanit taslagi",
    "reply draft",
)
TAG_MARKERS: tuple[str, ...] = (
    "etiketle",
    "sınıflandır",
    "siniflandir",
    "tagging",
    "classif",
    "sentiment",
)

# Basit anahtar kelime sözlüğü: metinde geçen kök → kanonik konu etiketi.
TOPIC_KEYWORDS: dict[str, str] = {
    "kahve": "kahve",
    "tatlı": "tatlı",
    "tatli": "tatlı",
    "servis": "servis",
    "garson": "servis",
    "fiyat": "fiyat",
    "temizlik": "temizlik",
    "müzik": "müzik",
    "muzik": "müzik",
    "kalabalık": "kalabalık",
    "kalabalik": "kalabalık",
}

_QUOTE_WORDS = 10  # alıntı: yorumun ilk 8–12 kelimesi


# ---------------------------------------------------------------------------
# Girdi ayrıştırma
# ---------------------------------------------------------------------------


def _json_blobs(text: str) -> list[Any]:
    """Metindeki JSON bloklarını (fence'li ya da gömülü) dener."""
    blobs: list[Any] = []
    for match in re.finditer(r"```(?:[A-Za-z0-9_-]+)?\s*(.*?)```", text, re.S):
        block = match.group(1).strip()
        try:
            blobs.append(json.loads(block))
        except (json.JSONDecodeError, ValueError):
            continue

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            blobs.append(json.loads(text[start : end + 1]))
        except (json.JSONDecodeError, ValueError):
            pass

    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end > start:
        try:
            blobs.append(json.loads(text[start : end + 1]))
        except (json.JSONDecodeError, ValueError):
            pass
    return blobs


def _walk_records(node: Any, out: list[dict[str, Any]], seen: set[str]) -> None:
    """Ağaçta `id` + `text` taşıyan yorum sözlüklerini toplar (sıra korunur)."""
    if isinstance(node, list):
        for item in node:
            _walk_records(item, out, seen)
        return
    if not isinstance(node, dict):
        return

    review_id = node.get("id", node.get("review_id"))
    text = node.get("text")
    if isinstance(review_id, (str, int)) and isinstance(text, str) and text.strip():
        key = str(review_id)
        if key not in seen:
            seen.add(key)
            out.append(
                {
                    "id": key,
                    "text": text,
                    "stars": node.get("stars"),
                    "month": node.get("month", ""),
                    "answered": bool(node.get("answered", False)),
                }
            )
    for value in node.values():
        if isinstance(value, (list, dict)):
            _walk_records(value, out, seen)


def _regex_records(text: str) -> list[dict[str, Any]]:
    """JSON parse edilemeyen metinler için düz `{...}` kayıt taraması."""
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in re.finditer(r"\{[^{}]*\}", text):
        chunk = match.group(0)
        if '"id"' not in chunk or '"text"' not in chunk:
            continue
        try:
            node = json.loads(chunk)
        except (json.JSONDecodeError, ValueError):
            continue
        _walk_records(node, records, seen)
    return records


def _extract_records(text: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for blob in _json_blobs(text):
        _walk_records(blob, records, seen)
    if not records:
        records = _regex_records(text)
    return records


def _stars(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 3.0
    if number != number:  # NaN
        return 3.0
    return max(1.0, min(5.0, number))


def _topics(text: str) -> list[str]:
    lowered = text.lower()
    found: list[str] = []
    for stem, topic in TOPIC_KEYWORDS.items():
        if stem in lowered and topic not in found:
            found.append(topic)
    return found


def _is_write_task(system: str, user: str) -> bool:
    """Görev tipini belirler (deterministik, öncelik sırası sabit).

    1. Sistem metninde write şemasının alan adı varsa → write.
    2. Sistem metninde etiketleme görevi işareti varsa → tag.
    3. Aksi hâlde daraltılmış anahtar kelime taraması (sistem + kullanıcı).

    Etiket promptunun gövdesindeki "write"/"yaz" gibi genel sözcükler artık
    write moduna sokmaz; EN etiket promptu bu yüzden güvenli.
    """
    system_lower = system.lower()
    if any(marker in system_lower for marker in WRITE_MARKERS):
        return True
    if any(marker in system_lower for marker in TAG_MARKERS):
        return False
    haystack = f"{system}\n{user}".lower()
    return any(keyword in haystack for keyword in WRITE_KEYWORDS)


def _quote(text: str) -> str:
    """Yorumun ilk 8–12 kelimesi; kaynak metnin birebir başı (prefix)."""
    matches = list(re.finditer(r"\S+", text))
    if not matches:
        return ""
    limit = min(_QUOTE_WORDS, len(matches))
    return text[: matches[limit - 1].end()]


# ---------------------------------------------------------------------------
# Görev üreticileri
# ---------------------------------------------------------------------------


def _tag_result(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for record in records:
        stars = _stars(record.get("stars"))
        if stars >= 4:
            sentiment = "positive"
        elif stars <= 2:
            sentiment = "negative"
        else:
            sentiment = "neutral"

        if sentiment == "negative":
            if stars <= 1:
                severity = 3
            elif stars <= 2:
                severity = 2
            else:  # pragma: no cover - savunma
                severity = 1
        else:
            severity = 1

        topics = _topics(record["text"])
        items.append(
            {
                "id": record["id"],
                "sentiment": sentiment,
                "topics": topics,
                "products": list(topics),
                "severity": severity,
            }
        )
    return items


def _reply_draft(name: str) -> str:
    return (
        f"Geri bildiriminiz için teşekkür ederiz. {name} konusundaki notunuzu "
        "ekibimizle paylaştık; en kısa sürede iyileştireceğiz."
    )


def _write_result(records: list[dict[str, Any]]) -> dict[str, Any]:
    if not records:
        raise ValueError(
            "mock write: user metninde {id, text, ...} biçiminde yorum kaydı yok"
        )

    positive = [r for r in records if _stars(r.get("stars")) >= 4]
    negative = [r for r in records if _stars(r.get("stars")) <= 2]

    praise_source = positive or records
    complaint_source = negative

    praise_topic = next(
        (topic for r in praise_source for topic in _topics(r["text"])), None
    )
    complaint_topic = next(
        (topic for r in complaint_source for topic in _topics(r["text"])), None
    )

    themes_praise: list[dict[str, Any]] = []
    if praise_source:
        lead = praise_source[0]
        themes_praise.append(
            {
                "name": praise_topic or "genel memnuniyet",
                "review_ids": [r["id"] for r in praise_source[:6]],
                "quote_review_id": lead["id"],
                "quote": _quote(lead["text"]),
            }
        )

    themes_complaint: list[dict[str, Any]] = []
    if complaint_source:
        lead = complaint_source[0]
        name = complaint_topic or "genel geri bildirim"
        themes_complaint.append(
            {
                "name": name,
                "review_ids": [r["id"] for r in complaint_source[:6]],
                "quote_review_id": lead["id"],
                "quote": _quote(lead["text"]),
                "reply_draft": _reply_draft(name),
            }
        )

    products_praised: list[dict[str, Any]] = []
    seen_products: set[str] = set()
    for record in praise_source:
        for topic in _topics(record["text"]):
            if topic in seen_products:
                continue
            seen_products.add(topic)
            ids = [
                r["id"] for r in praise_source if topic in _topics(r["text"])
            ]
            products_praised.append({"name": topic, "review_ids": ids})

    top_quotes: list[dict[str, Any]] = []
    seen_quotes: set[str] = set()
    for record in praise_source + records:
        if record["id"] in seen_quotes:
            continue
        seen_quotes.add(record["id"])
        top_quotes.append({"quote": _quote(record["text"]), "review_id": record["id"]})
        if len(top_quotes) >= 3:
            break

    evidence = complaint_source or praise_source
    step_topic = complaint_topic or praise_topic or "servis"
    # Serbest metinde rakam yok: doğrulamanın izinli sayı kümesi yalnızca
    # metrics/insights/kanıt sayılarını taşır (plan §5-E). "30 gün" gibi sabit
    # bir sayı bu kümenin dışında kalıp bloğu gizletiyordu.
    single_step = {
        "action": f"{step_topic} konusunda bu hafta tek bir iyileştirme uygulayın.",
        "reason": "Yorumlarda bu konu tekrar ediyor.",
        "evidence_review_ids": [r["id"] for r in evidence[:3]],
        "effort": "yaklaşık bir saat",
        "how_to_measure": (
            "Bir hafta boyunca bu konu geçen yorumların ortalama puanı"
        ),
    }

    unanswered = [r for r in records if not r.get("answered")]
    unanswered.sort(key=lambda r: (_stars(r.get("stars")), r.get("month", "")), reverse=False)
    unanswered_reply_drafts = [
        {
            "review_id": record["id"],
            "reply": (
                "Yorumunuz için teşekkür ederiz. Geri bildiriminizi dikkate alıp "
                "gerekli düzenlemeyi yapacağız."
            ),
        }
        for record in unanswered[:3]
    ]

    caption_subject = praise_topic or "yorumlarınız"
    instagram_caption = (
        f"Bu hafta {caption_subject} için sizden gelen güzel sözlere teşekkür ederiz. "
        "Sizi yeniden aramızda görmek isteriz."
    )

    return {
        "themes_praise": themes_praise,
        "themes_complaint": themes_complaint,
        "products_praised": products_praised,
        "instagram_caption": instagram_caption,
        "top_quotes": top_quotes,
        "single_step": single_step,
        "unanswered_reply_drafts": unanswered_reply_drafts,
    }


# ---------------------------------------------------------------------------
# Ana arayüz
# ---------------------------------------------------------------------------


def generate(
    profile: Any,
    system: str,
    user: str,
    schema: dict[str, Any] | None,
    thinking: str,
    max_tokens: int,
    api_key: str | None,
) -> AdapterResult:
    """Deterministik sahte yanıt üretir (ağ yok, rastgelelik yok)."""
    del profile, schema, thinking, max_tokens, api_key  # mock bu alanları kullanmaz

    started = time.monotonic()
    records = _extract_records(user)
    if _is_write_task(system, user):
        data: Any = _write_result(records)
    else:
        data = _tag_result(records)

    rendered = json.dumps(data, ensure_ascii=False, indent=2)
    usage = AdapterUsage(
        input_tokens=(len(system) + len(user)) // 4,
        output_tokens=len(rendered) // 4,
        thinking_tokens=0,
        duration_s=time.monotonic() - started,
    )
    return AdapterResult(data=data, usage=usage)
