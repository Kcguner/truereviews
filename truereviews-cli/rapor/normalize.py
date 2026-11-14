"""Apify ``compass/google-maps-reviews-scraper`` JSON -> :class:`Place` / :class:`Review`.

Tek normalizasyon noktası. Girdi iki biçimde kabul edilir:

* **Liste** — Apify dataset çıktısı: yorum sözlüklerinin listesi. Mekan alanları
  her öğeden (ilk dolu değer) okunur. Bir öğe ``reviews`` alt listesi taşıyorsa
  o liste de düzleştirilir (web'deki ``fetchReviews`` davranışı).
* **Sözlük** — ``{"place": {...}, "reviews": [...]}``.

Gizlilik sözleşmesi: yalnızca ``field_map`` içinde adı geçen alanlar okunur.
Yorumcu adı, profil linki, yorum URL'si ve fotoğraf URL'leri hiçbir zaman
``Review`` nesnesine taşınmaz; ``reviewImageUrls`` yalnızca sayıya (``image_count``)
iner.

``date`` alanı :class:`datetime.date` ya da ``None``'dır; bozuk/eksik tarih
``None`` olur ve ``month`` boş dizedir. Tarihi olmayan yorum ``Review``
listesinde kalır, yalnızca tarih temelli hesaplara girmez.
"""

from __future__ import annotations

import math
from datetime import date as _date
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

from rapor.schemas import Place, Review

__all__ = [
    "DEFAULT_FIELD_MAP",
    "NormalizeError",
    "normalize",
    "normalize_rating",
    "parse_date",
]

DEFAULT_RATING = 3.0


class NormalizeError(ValueError):
    """Girdi beklenen Apify biçiminde değil ya da zorunlu alan eksik."""


# ---------------------------------------------------------------------------
# Puan normalizasyonu — lib/apify.ts::normalizeRating ile birebir parite
# ---------------------------------------------------------------------------

def _js_number(raw: Any) -> float:
    """JS ``Number(raw)`` davranışının normalize için gereken kısmı.

    ``typeof raw === 'number'`` sayıyı olduğu gibi alır; string ``Number()`` ile
    çevrilir (boşluklu boş string -> 0, okunamayan -> NaN). Diğer tüm tipler
    (bool, None, dict, list) -> NaN.
    """
    if isinstance(raw, bool):
        # JS: typeof true === 'boolean' -> Number(true) çağrılmaz, NaN.
        return math.nan
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str):
        s = raw.strip()
        if s == "":
            return 0.0  # JS Number("") === 0
        low = s.lower()
        if low in ("infinity", "+infinity"):
            return math.inf
        if low == "-infinity":
            return -math.inf
        try:
            if low.startswith(("0x", "+0x", "-0x")):
                return float(int(s, 16))
            return float(s)
        except ValueError:
            return math.nan
    return math.nan


def _js_round(value: float) -> float:
    """JS ``Math.round``: .5 daima +Infinity yönüne yuvarlanır."""
    return math.floor(value + 0.5)


def normalize_rating(value: Any) -> float:
    """Ham puanı 1-5 aralığına indirger (``lib/apify.ts`` paritesi).

    * okunamaz / NaN / None / <= 0 -> nötr 3
    * > 10 -> nötr 3
    * 1-10 arası -> 0.1 hassasiyetle yuvarlanır, 5'e kırpılır
    """
    n = _js_number(value)
    if not math.isfinite(n) or n <= 0:
        return DEFAULT_RATING
    if n > 10:
        return DEFAULT_RATING
    return min(5.0, max(1.0, _js_round(n * 10) / 10))


# ---------------------------------------------------------------------------
# field_map
# ---------------------------------------------------------------------------

# Mantıksal alan -> (varsayılan Apify kaynağı, zorunlu mu?)
_REVIEW_FIELDS: dict[str, tuple[str, bool]] = {
    "id": ("reviewId", True),
    "text": ("text", True),
    "stars": ("stars", True),
    "date": ("publishedAtDate", False),
    "owner_response": ("responseFromOwnerText", False),
    "images": ("reviewImageUrls", False),
    "context": ("reviewContext", False),
    "detailed_ratings": ("reviewDetailedRating", False),
    "language": ("originalLanguage", False),
}

_PLACE_FIELDS: dict[str, tuple[str, bool]] = {
    "title": ("title", True),
    "category": ("categoryName", False),
    "city": ("city", False),
    "country_code": ("countryCode", False),
    "total_score": ("totalScore", False),
    "reviews_count": ("reviewsCount", False),
}


def _default_field_map() -> dict[str, str]:
    """Plan §4 tablosunun düz mantıksal ad haritası."""
    out = {logical: source for logical, (source, _) in _REVIEW_FIELDS.items()}
    out.update({logical: source for logical, (source, _) in _PLACE_FIELDS.items()})
    return out


DEFAULT_FIELD_MAP: dict[str, str] = _default_field_map()


def _resolve_field_map(field_map: Mapping[str, Any] | None) -> dict[str, str]:
    """Kullanıcı field_map'ini doğrular ve düz mantıksal ad haritasına indirger.

    Hem düz (``{"text": "reviewText", ...}``) hem iç içe
    (``{"reviews": {...}, "place": {...}}``) biçim kabul edilir. Bilinmeyen
    mantıksal ad net hata verir.
    """
    resolved = dict(DEFAULT_FIELD_MAP)
    if not field_map:
        return resolved

    known = set(DEFAULT_FIELD_MAP)

    def apply(group: Mapping[str, Any]) -> None:
        for logical, source in group.items():
            if logical not in known:
                raise NormalizeError(
                    f"field_map: bilinmeyen alan '{logical}'. Geçerli alanlar: "
                    + ", ".join(sorted(known))
                )
            if not isinstance(source, str) or not source:
                raise NormalizeError(
                    f"field_map: '{logical}' için kaynak alan adı boş/geçersiz."
                )
            resolved[logical] = source

    nested_reviews = field_map.get("reviews")
    nested_place = field_map.get("place")
    if isinstance(nested_reviews, Mapping) or isinstance(nested_place, Mapping):
        if isinstance(nested_reviews, Mapping):
            apply(nested_reviews)
        if isinstance(nested_place, Mapping):
            apply(nested_place)
        extra = set(field_map) - {"reviews", "place"}
        if extra:
            raise NormalizeError(
                "field_map: iç içe biçimde beklenmeyen anahtar(lar): "
                + ", ".join(sorted(extra))
            )
        return resolved

    apply(field_map)
    return resolved


# ---------------------------------------------------------------------------
# Tarih
# ---------------------------------------------------------------------------

def parse_date(value: Any) -> _date | None:
    """ISO tarih/saat -> :class:`datetime.date`; bozuk/eksik -> ``None``."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, _date):
        return value
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        # Apify bazen epoch ms döndürebilir; makul aralık dışını reddet.
        try:
            ts = float(value)
            if ts > 1e11:  # ms
                ts /= 1000.0
            return datetime.fromtimestamp(ts, tz=timezone.utc).date()
        except (OverflowError, OSError, ValueError):
            return None
    if not isinstance(value, str):
        return None

    s = value.strip()
    if not s:
        return None
    if s.endswith("Z") or s.endswith("z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s).date()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d.%m.%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _month_of(day: _date | None) -> str:
    return day.strftime("%Y-%m") if day is not None else ""


# ---------------------------------------------------------------------------
# Girdi biçimi
# ---------------------------------------------------------------------------

def _as_records(data: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Girdiyi (yorum kayıtları, mekan kaynağı) ikilisine indirger."""
    if isinstance(data, Mapping):
        place = data.get("place")
        reviews = data.get("reviews")
        if reviews is None and isinstance(place, Mapping):
            reviews = place.get("reviews")
        if reviews is None:
            raise NormalizeError("Girdi sözlüğünde 'reviews' listesi yok.")
        if not isinstance(reviews, list):
            raise NormalizeError("'reviews' bir liste olmalı.")
        place_src = dict(place) if isinstance(place, Mapping) else {}
        # Mekan alanları yorumlarda da varsa place sözlüğü önceliklidir.
        if not place_src and reviews:
            first = reviews[0]
            if isinstance(first, Mapping):
                place_src = dict(first)
        records = [r for r in reviews if isinstance(r, Mapping)]
        return records, place_src

    if isinstance(data, Iterable) and not isinstance(data, (str, bytes)):
        items = list(data)
        records: list[dict[str, Any]] = []
        place_src: dict[str, Any] = {}
        for item in items:
            if not isinstance(item, Mapping):
                continue
            nested = item.get("reviews")
            if isinstance(nested, list):
                # Dataset öğesi mekan özeti + iç yorum listesi taşıyor.
                for key, val in item.items():
                    if key != "reviews" and _has_value(val) and not _has_value(place_src.get(key)):
                        place_src[key] = val
                for r in nested:
                    if isinstance(r, Mapping):
                        records.append(r)
            else:
                records.append(item)
                for key, val in item.items():
                    if _has_value(val) and not _has_value(place_src.get(key)):
                        place_src[key] = val
        return records, place_src

    raise NormalizeError(
        "Girdi bir liste (Apify dataset) ya da {'place': ..., 'reviews': ...} sözlüğü olmalı."
    )


def _has_value(value: Any) -> bool:
    return value is not None and value != "" and value != [] and value != {}


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def _as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        f = _as_float(value)
        return int(f) if f is not None else None


def _as_optional_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        return s or None
    return str(value)


def _detailed(value: Any) -> dict[str, float]:
    if not isinstance(value, Mapping):
        return {}
    out: dict[str, float] = {}
    for key, raw in value.items():
        f = _as_float(raw)
        if f is not None and _has_value(key):
            out[str(key)] = f
    return out


def _as_context(value: Any) -> dict[str, Any]:
    """``reviewContext`` şeması ``dict``; farklı biçimleri güvenle sar."""
    if isinstance(value, Mapping):
        return dict(value)
    if isinstance(value, (list, tuple)):
        return {"items": list(value)}
    if isinstance(value, str):
        s = value.strip()
        return {"source": s} if s else {}
    return {}


def _image_count(value: Any) -> int:
    if isinstance(value, (list, tuple)):
        return sum(1 for item in value if item)
    if isinstance(value, str):
        return 1 if value.strip() else 0
    return 0


# ---------------------------------------------------------------------------
# Ana fonksiyon
# ---------------------------------------------------------------------------

def normalize(data: Any, field_map: Mapping[str, Any] | None = None) -> Any:
    """Apify JSON -> ``NormalizedData(place, reviews)``.

    Dönüş nesnesi ``NormalizedData`` sınıfıdır; ``schemas`` modülünde tanımlıysa
    o kullanılır, değilse yerel eşdeğeri döner.
    """
    fields = _resolve_field_map(field_map)
    records, place_src = _as_records(data)
    if not records:
        raise NormalizeError("Girdide hiç yorum kaydı yok.")

    # field_map'te adı geçen zorunlu alan kayıtta yoksa net hata. (Yıldız
    # alanı eksikse nötr 3 kabul edilir; plan §4.)
    for idx, record in enumerate(records):
        for logical in ("id", "text", "stars"):
            source = fields[logical]
            if source not in record and logical != "stars":
                raise NormalizeError(
                    f"Zorunlu alan eksik: '{logical}' (kaynak alan '{source}'), "
                    f"kayıt #{idx}."
                )

    reviews: list[Review] = []
    for record in records:
        raw_stars = record.get(fields["stars"])

        owner_response = _as_optional_str(record.get(fields["owner_response"]))
        parsed = parse_date(record.get(fields["date"]))

        review = Review(
            id=_as_optional_str(record.get(fields["id"])) or "",
            text=_as_optional_str(record.get(fields["text"])) or "",
            stars=normalize_rating(raw_stars),
            date=parsed,
            month=_month_of(parsed),
            answered=bool(owner_response),
            owner_response=owner_response,
            image_count=_image_count(record.get(fields["images"])),
            detailed_ratings=_detailed(record.get(fields["detailed_ratings"])),
            language=_as_optional_str(record.get(fields["language"])),
            context=_as_context(record.get(fields["context"])),
        )
        reviews.append(review)

    place = Place(
        title=_as_optional_str(place_src.get(fields["title"])) or "",
        category=_as_optional_str(place_src.get(fields["category"])),
        city=_as_optional_str(place_src.get(fields["city"])),
        country_code=_as_optional_str(place_src.get(fields["country_code"])),
        total_score=_as_float(place_src.get(fields["total_score"])),
        reviews_count=_as_int(place_src.get(fields["reviews_count"])),
    )

    return _make_normalized(place, reviews)


def _make_normalized(place: Place, reviews: list[Review]) -> Any:
    try:
        from rapor.schemas import NormalizedData as SchemaNormalizedData  # type: ignore[attr-defined]
    except (ImportError, AttributeError):
        return NormalizedData(place=place, reviews=reviews)
    return SchemaNormalizedData(place=place, reviews=reviews)


class NormalizedData:
    """``schema.NormalizedData`` yoksa kullanılan yerel eşdeğer."""

    __slots__ = ("place", "reviews")

    def __init__(self, place: Place, reviews: list[Review]) -> None:
        self.place = place
        self.reviews = list(reviews)

    def __repr__(self) -> str:  # pragma: no cover - hata ayıklama kolaylığı
        return f"NormalizedData(place={self.place!r}, reviews={len(self.reviews)})"
