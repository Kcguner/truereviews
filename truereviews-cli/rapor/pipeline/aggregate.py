"""C adımı — konu kümesi, kanıt gücü, yanıtsız önceliği (plan §5-C).

Model yok. Etiketler NFKC + casefold + trim ile normalize edilir,
``config.topic_aliases`` eş anlamlıları birleştirir. Aynı girdi her çağrıda
birebir aynı ``Aggregated`` çıktısını üretir: tüm sıralamalar sabittir
(yorum sayısı azalan, sonra ad; eşitlikte id).

Kurallar:

* Kanonik ad = alias anahtarının orijinal biçimi (``servis`` okunur adı).
* Eşleşmeyen etiket normalize edilmiş haliyle ayrı konu kalır.
* Konu övgü/şikayet ayrımı: sentiment çoğunluğu; eşitlikte ortalama yıldız
  ``< 3`` ise şikayet, değilse övgü.
* Kanıt gücü: benzersiz yorum sayısı ``>= 3`` → ``strong``, ``1–2`` → ``watch``.
* "Son 3 ay" = son 90 gün; ``today`` referansı sabitlenebilir.
* Yanıtsız sıralaması: yıldız artan, sonra tarih azalan (yeni önce).

Tarihi olmayan yorumlar tarih aralığına ve son 90 gün sayımına girmez;
yorum sayısı, ortalama ve duygu dağılımına girer.
"""

from __future__ import annotations

import datetime
import unicodedata
from collections import defaultdict
from typing import Any, Iterable, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field

from rapor.schemas import Review, TagItem

__all__ = [
    "RECENT_WINDOW_DAYS",
    "STRONG_THRESHOLD",
    "EvidenceReview",
    "SentimentBreakdown",
    "TopicCluster",
    "ProductPraised",
    "UnansweredReview",
    "Aggregated",
    "canonicalize",
    "aggregate",
]

# Plan §5-A ile aynı pencere: "son 3 ay" = 90 gün.
RECENT_WINDOW_DAYS = 90
# Plan §5-C: 3+ yorum "güçlü", 1–2 "izlenmeli".
STRONG_THRESHOLD = 3


# ---------------------------------------------------------------------------
# Modeller
# ---------------------------------------------------------------------------


class EvidenceReview(BaseModel):
    """D adımına giden ham kanıt yorumu (alıntı birebir buradan seçilir)."""

    model_config = ConfigDict(extra="ignore")

    id: str
    text: str
    stars: float
    month: str
    answered: bool = False


class SentimentBreakdown(BaseModel):
    """Konuya giren yorumların duygu dağılımı (her yorum bir kez sayılır)."""

    model_config = ConfigDict(extra="ignore")

    positive: int = 0
    negative: int = 0
    neutral: int = 0


class TopicCluster(BaseModel):
    """Tek konu kümesi. Rozet sayısı ``review_count`` = ``len(review_ids)``."""

    model_config = ConfigDict(extra="ignore")

    name: str
    review_count: int
    review_ids: list[str]
    date_start: datetime.date | None = None
    date_end: datetime.date | None = None
    average_stars: float | None = None
    sentiment: SentimentBreakdown
    recent_count: int  # son 90 gün (today referanslı)
    strength: Literal["strong", "watch"]
    evidence_reviews: list[EvidenceReview] = Field(default_factory=list)


class ProductPraised(BaseModel):
    """Övülen ürün: kanonik ad + benzersiz yorumlar + yıldız ortalaması."""

    model_config = ConfigDict(extra="ignore")

    name: str
    review_count: int
    review_ids: list[str]
    average_stars: float | None = None


class UnansweredReview(BaseModel):
    """Yanıtsız yorum satırı (düşük puan önce, sonra yeni önce)."""

    model_config = ConfigDict(extra="ignore")

    id: str
    stars: float
    text: str
    month: str
    date: datetime.date | None = None


class Aggregated(BaseModel):
    """C adımı çıktısı; sayılar D'ye hazır gider."""

    model_config = ConfigDict(extra="ignore")

    praise_topics: list[TopicCluster] = Field(default_factory=list)
    complaint_topics: list[TopicCluster] = Field(default_factory=list)
    products_praised: list[ProductPraised] = Field(default_factory=list)
    unanswered_list: list[UnansweredReview] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Kanonikleştirme
# ---------------------------------------------------------------------------


def _normalize_label(label: str) -> str:
    """NFKC + casefold + trim; Türkçe ``İ`` → ``i`` birleşmesi dahil."""
    text = unicodedata.normalize("NFKC", str(label))
    text = unicodedata.normalize("NFKC", text.casefold())
    # casefold("İ") = "i" + U+0307; okunur eşleşme için birleşik noktayı at.
    text = text.replace("i\u0307", "i")
    return " ".join(text.split())


class _Canonicalizer:
    """Alias sözlüğünü iki geçişte kurar; kanonik anahtarlar önce gelir."""

    def __init__(self, aliases: Mapping[str, Iterable[str]] | None) -> None:
        self._display: dict[str, str] = {}
        raw = aliases or {}
        # 1. geçiş: anahtarlar kendi adlarını kazanır.
        for canonical in raw:
            key = _normalize_label(canonical)
            if key and key not in self._display:
                self._display[key] = str(canonical).strip()
        # 2. geçiş: eş anlamlılar; çakışmada ilk giriş kazanır (deterministik).
        for canonical, synonyms in raw.items():
            display = self._display.get(_normalize_label(canonical))
            if display is None:
                continue
            for synonym in synonyms or ():
                key = _normalize_label(synonym)
                if key and key not in self._display:
                    self._display[key] = display

    def name(self, label: str) -> str:
        key = _normalize_label(label)
        return self._display.get(key, key)


def canonicalize(
    labels: Iterable[str],
    aliases: Mapping[str, Iterable[str]] | None = None,
) -> list[str]:
    """Etiket listesini kanonik adlara çevirir (sıra korunur, tekrarsız)."""
    canonicalizer = _Canonicalizer(aliases)
    seen: set[str] = set()
    result: list[str] = []
    for label in labels:
        name = canonicalizer.name(label)
        if not name or name in seen:
            continue
        seen.add(name)
        result.append(name)
    return result


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------


def _read(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _aliases(config: Any) -> Mapping[str, Iterable[str]]:
    raw = _read(config, "topic_aliases", {}) or {}
    if not isinstance(raw, Mapping):
        return {}
    return raw


def _round1(value: float | None) -> float | None:
    return None if value is None else round(value + 0.0, 1)


def _topic_sort_key(cluster: TopicCluster) -> tuple[int, str]:
    return (-cluster.review_count, cluster.name.casefold())


def _product_sort_key(product: ProductPraised) -> tuple[int, str]:
    return (-product.review_count, product.name.casefold())


# ---------------------------------------------------------------------------
# Ana fonksiyon
# ---------------------------------------------------------------------------


def aggregate(
    reviews: list[Review],
    tags: list[TagItem],
    config: Any,
    *,
    lang: str = "tr",
    today: datetime.date | None = None,
) -> Aggregated:
    """Yorum + etiketlerden deterministik konu kümeleri üretir.

    Args:
        reviews: Normalize edilmiş yorumlar.
        tags: B adımı etiketleri (``topics`` / ``products``).
        config: ``topic_aliases`` taşıyan nesne veya sözlük.
        lang: Rapor dili; sayıları etkilemez (imza sözleşmesi).
        today: "Son 3 ay" referansı; ``None`` ise bugün.
    """
    del lang  # sayılar dilden bağımsız; parametre sözleşme gereği mevcut
    report_date = today or datetime.date.today()
    cutoff = report_date - datetime.timedelta(days=RECENT_WINDOW_DAYS)

    review_by_id: dict[str, Review] = {review.id: review for review in reviews}
    canonicalizer = _Canonicalizer(_aliases(config))

    # topic adı -> {review id: sentiment} (ilk etiket kazanır, tekrar sayılmaz)
    topic_members: dict[str, dict[str, str]] = defaultdict(dict)
    # ürün adı -> benzersiz yorum id kümesi
    product_members: dict[str, set[str]] = defaultdict(set)

    for tag in tags:
        review = review_by_id.get(tag.id)
        if review is None:
            continue  # etiketi olup yorumu olmayan kayıt kanıt üretemez
        for label in tag.topics:
            name = canonicalizer.name(label)
            if not name:
                continue
            topic_members[name].setdefault(tag.id, tag.sentiment)
        for label in tag.products:
            name = canonicalizer.name(label)
            if name:
                product_members[name].add(tag.id)

    praise_topics: list[TopicCluster] = []
    complaint_topics: list[TopicCluster] = []

    for name in sorted(topic_members):
        members = topic_members[name]
        member_reviews = [review_by_id[rid] for rid in sorted(members)]
        stars_values = [review.stars for review in member_reviews]
        average = _round1(sum(stars_values) / len(stars_values)) if stars_values else None

        sentiment = SentimentBreakdown()
        for mood in members.values():
            setattr(sentiment, mood, getattr(sentiment, mood) + 1)

        dates = [review.date for review in member_reviews if review.date is not None]
        recent_count = sum(
            1 for review in member_reviews if review.date is not None and review.date > cutoff
        )

        # Övgü/şikayet: sentiment çoğunluğu; eşitlikte yıldız ortalaması.
        if sentiment.negative > sentiment.positive:
            is_complaint = True
        elif sentiment.positive > sentiment.negative:
            is_complaint = False
        else:
            is_complaint = average is not None and average < 3.0

        evidence = [
            EvidenceReview(
                id=review.id,
                text=review.text,
                stars=review.stars,
                month=review.month,
                answered=review.answered,
            )
            for review in sorted(
                member_reviews, key=lambda item: (item.stars, item.id)
            )
        ]

        cluster = TopicCluster(
            name=name,
            review_count=len(members),
            review_ids=sorted(members),
            date_start=min(dates) if dates else None,
            date_end=max(dates) if dates else None,
            average_stars=average,
            sentiment=sentiment,
            recent_count=recent_count,
            strength="strong" if len(members) >= STRONG_THRESHOLD else "watch",
            evidence_reviews=evidence,
        )
        (complaint_topics if is_complaint else praise_topics).append(cluster)

    praise_topics.sort(key=_topic_sort_key)
    complaint_topics.sort(key=_topic_sort_key)

    products_praised: list[ProductPraised] = []
    for name in sorted(product_members):
        ids = sorted(product_members[name])
        stars_values = [review_by_id[rid].stars for rid in ids]
        products_praised.append(
            ProductPraised(
                name=name,
                review_count=len(ids),
                review_ids=ids,
                average_stars=(
                    _round1(sum(stars_values) / len(stars_values)) if stars_values else None
                ),
            )
        )
    products_praised.sort(key=_product_sort_key)

    unanswered = [review for review in reviews if not review.answered]
    unanswered.sort(
        key=lambda review: (
            review.stars,
            -(review.date.toordinal() if review.date is not None else 1),
            review.id,
        )
    )
    unanswered_list = [
        UnansweredReview(
            id=review.id,
            stars=review.stars,
            text=review.text,
            month=review.month,
            date=review.date,
        )
        for review in unanswered
    ]

    return Aggregated(
        praise_topics=praise_topics,
        complaint_topics=complaint_topics,
        products_praised=products_praised,
        unanswered_list=unanswered_list,
    )
