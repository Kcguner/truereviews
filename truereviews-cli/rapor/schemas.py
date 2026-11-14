"""Veri sözleşmeleri (plan §2, §4, §5-D).

`normalize.py` Apify JSON'ını `Place`/`Review`'a çevirir. `pipeline/tag.py`
`TagItem` üretir, `pipeline/write.py` `WriteResult` döndürür. `pipeline/validate.py`
aynı modellerle doğrular. Alan adları plan §5-D ile birebirdir; değiştirme.
"""

from __future__ import annotations

import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# gemini-3.8-flash `minimal` thinking config'ini doğrulamada reddeder (plan §3).
# config.py profil yüklerken bu kümeyi kullanır; tests/test_schemas.py da doğrular.
GEMINI_MINIMAL_REJECTED_MODELS: set[str] = {"gemini-3.8-flash"}


class RecordModel(BaseModel):
    """Katı alt model + dict benzeri okuma.

    Pipeline çoğunlukla alan erişimi (`theme.name`) kullanır; eski/sözlük
    tabanlı kod da (`theme["name"]`, `dict(theme)`) çalışsın diye `keys()`,
    `__getitem__`, `get()` verilir. `model_dump()` her iki dünyaya da köprü.
    """

    model_config = ConfigDict(extra="ignore")

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError as exc:  # KeyError sözleşmesi korunur
            raise KeyError(key) from exc

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)

    def keys(self) -> list[str]:
        return list(type(self).model_fields)

    def values(self) -> list[Any]:
        return [getattr(self, key) for key in self.keys()]

    def items(self) -> list[tuple[str, Any]]:
        return [(key, getattr(self, key)) for key in self.keys()]


class Place(BaseModel):
    """Mekan künyesi (plan §4, `field_map` ile Apify'dan gelir)."""

    model_config = ConfigDict(extra="ignore")

    title: str
    category: str | None = None
    city: str | None = None
    country_code: str | None = None
    total_score: float | None = None  # Apify totalScore; yoksa None
    reviews_count: int | None = None


class Review(BaseModel):
    """Tek yorum. Gizlilik: yorumcu adı/link/fotoğraf/URL bu modelde yok."""

    model_config = ConfigDict(extra="ignore")

    id: str
    text: str
    stars: float  # normalizeRating SONRASI değer (1–5, 0.1 hassasiyet korunur)
    date: datetime.date | None = None  # publishedAtDate'ten
    month: str  # "YYYY-MM"
    answered: bool = False
    owner_response: str | None = None
    image_count: int = 0
    detailed_ratings: dict[str, float] = Field(
        default_factory=dict
    )  # reviewDetailedRating; hizmet adı → 1–5
    language: str | None = None
    context: dict = Field(default_factory=dict)  # reviewContext olduğu gibi


class NormalizedData(BaseModel):
    """`normalize()` çıktısı: mekan künyesi + yorumlar (plan §4)."""

    model_config = ConfigDict(extra="ignore")

    place: Place
    reviews: list[Review]


class TagItem(BaseModel):
    """B adımı çıktısı: tek yorumun etiketi (plan §5-B)."""

    model_config = ConfigDict(extra="ignore")

    id: str
    sentiment: Literal["positive", "negative", "neutral"]
    topics: list[str] = Field(default_factory=list)
    products: list[str] = Field(default_factory=list)
    severity: int = Field(ge=1, le=3)


# --- D adımı: sabit JSON şeması (plan §5-D) -------------------------------


class PraiseTheme(RecordModel):
    name: str
    review_ids: list[str] = Field(min_length=1)  # plan §5-E: boş liste reddedilir
    quote_review_id: str
    quote: str


class ComplaintTheme(RecordModel):
    name: str
    review_ids: list[str] = Field(min_length=1)
    quote_review_id: str
    quote: str
    reply_draft: str


class ProductPraised(RecordModel):
    name: str
    review_ids: list[str] = Field(min_length=1)


class TopQuote(RecordModel):
    quote: str
    review_id: str


class SingleStep(RecordModel):
    action: str
    reason: str
    evidence_review_ids: list[str] = Field(min_length=1)
    effort: str
    how_to_measure: str


class UnansweredReplyDraft(RecordModel):
    review_id: str
    reply: str


class WriteResult(BaseModel):
    """D adımının JSON çıktısı. Zorunlu anahtarlar ve boş `review_ids` doğrulanır.

    `strength` ve rozet sayıları bu modelde yoktur: C adımı bunları
    `report.json`'a koddan ekler (İlke 1).
    """

    model_config = ConfigDict(extra="ignore")

    themes_praise: list[PraiseTheme]
    themes_complaint: list[ComplaintTheme]
    products_praised: list[ProductPraised]
    instagram_caption: str
    top_quotes: list[TopQuote]
    single_step: SingleStep
    unanswered_reply_drafts: list[UnansweredReplyDraft]

    def to_dict(self) -> dict[str, Any]:
        """JSON'a yazılabilir düz sözlük (rapor çıktısı, cache anahtarı)."""
        return self.model_dump(mode="json")


def write_result_schema() -> dict[str, Any]:
    """LLM'e verilecek JSON şeması (response_schema vb.)."""
    return WriteResult.model_json_schema()
