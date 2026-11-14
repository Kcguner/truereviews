"""E adımı — alıntı birebirlik, id varlığı, sayı tutarlılığı (plan §5-E).

Kurallar (plan §5-E birebir):

1. **Alıntı birebirlik**: ``themes_praise`` / ``themes_complaint``
   ``quote`` alanı ve ``top_quotes[].quote``, ``quote_review_id`` /
   ``review_id`` yorumunun ham metninde NFKC + casefold + boşluk/noktalama
   normalizasyonundan sonra **substring** olmalı. Alıntı ``<= 15`` kelime.
2. **id varlığı**: tüm ``review_ids`` (her tema, ``products_praised``,
   ``single_step.evidence_review_ids``, ``unanswered_reply_drafts[].review_id``)
   gerçek yorum id'lerinde bulunmalı. Boş ``review_ids`` reddedilir.
3. **Sayı tutarlılığı**: alıntılar tarama dışıdır (kaynak metin). Diğer tüm
   serbest metinlerden (tema adları, ``reply_draft``, ``instagram_caption``,
   ``single_step`` alanları, ürün adları, yanıt taslakları) ``\\d+([.,]\\d+)?``
   ile sayılar çıkarılır. İzin verilen küme metrics/insights/aggregated
   sayıları + ``review_ids`` uzunlukları + 0–100 skor + yıldızlar (1–5).
   Küme dışı sayı taşıyan blok gizlenir.

Geçmeyen blok ``hidden_blocks``'a girer; çağıran onu rapora koymaz ve
``warnings`` satırlarını ``review.md``'ye yazar. ``ratio`` (geçen/toplam blok)
``compare`` komutu içindir.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Iterable, Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from rapor.schemas import WriteResult

__all__ = [
    "MAX_QUOTE_WORDS",
    "BlockValidation",
    "ValidationResult",
    "normalize_quote",
    "quote_problem",
    "validate_report",
]

# Plan §5-E: alıntı en fazla 15 kelime.
MAX_QUOTE_WORDS = 15

_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")


# ---------------------------------------------------------------------------
# Sonuç modelleri
# ---------------------------------------------------------------------------


class BlockValidation(BaseModel):
    """Tek bloğun doğrulama sonucu. ``block`` kararlı bir kimliktir."""

    model_config = ConfigDict(extra="ignore")

    block: str
    ok: bool
    reason: str | None = None


class ValidationResult(BaseModel):
    """E adımı çıktısı (plan §5-E, §7 ``report.json.validation``)."""

    model_config = ConfigDict(extra="ignore")

    blocks: list[BlockValidation] = Field(default_factory=list)
    hidden_blocks: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    valid_blocks: int = 0
    total_blocks: int = 0
    ratio: float = 0.0
    schema_valid: bool = True
    valid: bool = False

    @property
    def passed(self) -> bool:
        """Tüm bloklar geçti mi? (gizlenen blok yoksa True)."""
        return self.valid and not self.hidden_blocks


# ---------------------------------------------------------------------------
# Alıntı normalizasyonu
# ---------------------------------------------------------------------------


def normalize_quote(text: str | None) -> str:
    """NFKC + casefold; noktalama/işaret ve tüm boşluklar tek boşluk.

    Noktalama boşluğa çevrilir (silinmez): ``iyi-kahve`` ile ``iyi kahve``
    eşleşir. Görünmez/ayrı işaretler de aynı kurala girer.
    """
    normalized = unicodedata.normalize("NFKC", str(text or "")).casefold()
    # Türkçe "İ".casefold() = "i" + U+0307; kaynakla okunur eşleşme için at.
    normalized = unicodedata.normalize("NFKC", normalized).replace("i\u0307", "i")
    chars: list[str] = []
    for char in normalized:
        category = unicodedata.category(char)
        if char.isspace() or category.startswith("P") or category.startswith("S"):
            chars.append(" ")
        else:
            chars.append(char)
    return re.sub(r"\s+", " ", "".join(chars)).strip()


def quote_problem(quote: str | None, source: str | None) -> str | None:
    """Alıntı kurallarını denetler; sorun yoksa ``None``.

    Dönen metinler kısa ve Türkçedir (``review.md`` uyarısına gider).
    """
    raw = str(quote or "")
    if not raw.strip():
        return "alıntı boş"
    words = raw.split()
    if len(words) > MAX_QUOTE_WORDS:
        return f"alıntı {len(words)} kelime (en fazla {MAX_QUOTE_WORDS})"
    needle = normalize_quote(raw)
    haystack = normalize_quote(source)
    if not needle:
        return "alıntı boş"
    if needle not in haystack:
        return "alıntı kaynak yorumda birebir yok"
    return None


# ---------------------------------------------------------------------------
# Girdi yardımcıları
# ---------------------------------------------------------------------------


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, Mapping):
        return dict(value)
    if hasattr(value, "__dict__"):
        return vars(value)
    return {}


def _review_id(review: Any) -> str | None:
    if isinstance(review, Mapping):
        value = review.get("id")
    else:
        value = getattr(review, "id", None)
    return None if value is None else str(value)


def _review_text(review: Any) -> str:
    if isinstance(review, Mapping):
        value = review.get("text")
    else:
        value = getattr(review, "text", "")
    return str(value or "")


def _canonical_number(value: float) -> float:
    """Sayı karşılaştırma anahtarı: tam sayılar ``float(int)``, diğerleri 2 hane."""
    if abs(value - round(value)) < 1e-9:
        return float(int(round(value)))
    return round(float(value), 2)


def _add_number(target: set[float], value: Any) -> None:
    if isinstance(value, bool) or value is None:
        return
    try:
        number = float(value)
    except (TypeError, ValueError):
        return
    if number != number or number in (float("inf"), float("-inf")):
        return
    target.add(_canonical_number(number))
    # 0–1 aralığındaki oranlar yüzde olarak da yazılabilir (response_rate 0.35 → %35).
    if 0 < number <= 1:
        target.add(_canonical_number(number * 100))


def _collect_numbers(node: Any, target: set[float], *, strings: bool) -> None:
    """Ağaçtaki sayıları toplar; ``strings`` ise metinlerden de sayı çıkarır."""
    if isinstance(node, BaseModel):
        node = node.model_dump(mode="json")
    if isinstance(node, Mapping):
        for value in node.values():
            _collect_numbers(value, target, strings=strings)
        return
    if isinstance(node, (list, tuple, set)):
        for value in node:
            _collect_numbers(value, target, strings=strings)
        return
    if isinstance(node, str):
        if strings:
            for token in _NUMBER_RE.findall(node):
                _add_number(target, float(token.replace(",", ".")))
        return
    if isinstance(node, (int, float)):
        _add_number(target, node)


def _review_id_lengths(write: WriteResult) -> Iterable[int]:
    for theme in write.themes_praise:
        yield len(theme.review_ids)
    for theme in write.themes_complaint:
        yield len(theme.review_ids)
    for product in write.products_praised:
        yield len(product.review_ids)
    yield len(write.single_step.evidence_review_ids)


def _allowed_numbers(
    write: WriteResult,
    metrics: Any,
    insights: Any,
    aggregated: Any,
) -> set[float]:
    """Plan §5-E izinli sayı kümesi."""
    allowed: set[float] = set()

    _collect_numbers(metrics, allowed, strings=False)
    # Insights metinleri koddan gelen sayıları taşır ("0,4", "3", "%35").
    _collect_numbers(insights, allowed, strings=True)
    _collect_numbers(aggregated, allowed, strings=False)

    for count in _review_id_lengths(write):
        _add_number(allowed, count)
    # Yıldızlar her zaman 1–5 aralığındadır (plan §4).
    for star in range(1, 6):
        allowed.add(_canonical_number(star))
    return allowed


def _offending_numbers(texts: Iterable[str], allowed: set[float]) -> list[str]:
    """İzinli küme dışındaki sayı belirteçlerini (metindeki haliyle) döner."""
    offenders: list[str] = []
    for text in texts:
        for token in _NUMBER_RE.findall(str(text or "")):
            try:
                number = float(token.replace(",", "."))
            except ValueError:  # pragma: no cover - regex garanti eder
                continue
            if _canonical_number(number) not in allowed:
                if token not in offenders:
                    offenders.append(token)
    return offenders


# ---------------------------------------------------------------------------
# Blok doğrulamaları
# ---------------------------------------------------------------------------


def _ids_problems(ids: list[str], known: set[str]) -> list[str]:
    problems: list[str] = []
    if not ids:
        problems.append("review_ids boş")
        return problems
    unknown = [str(item) for item in ids if str(item) not in known]
    if unknown:
        problems.append("bilinmeyen review_id: " + ", ".join(unknown[:5]))
    return problems


def _finish(
    blocks: list[BlockValidation],
    warnings: list[str],
    *,
    schema_valid: bool = True,
) -> ValidationResult:
    total = len(blocks)
    valid = sum(1 for block in blocks if block.ok)
    hidden = [block.block for block in blocks if not block.ok]
    ratio = (valid / total) if total else 0.0
    return ValidationResult(
        blocks=blocks,
        hidden_blocks=hidden,
        warnings=warnings,
        valid_blocks=valid,
        total_blocks=total,
        ratio=round(ratio, 4),
        schema_valid=schema_valid,
        valid=bool(total) and valid == total,
    )


def _block(name: str, problems: list[str], warnings: list[str]) -> BlockValidation:
    ok = not problems
    if not ok:
        warnings.append(f"{name}: " + "; ".join(problems))
    return BlockValidation(block=name, ok=ok, reason=None if ok else "; ".join(problems))


def validate_report(
    write_result: WriteResult | Mapping[str, Any],
    reviews: list[Any] | tuple[Any, ...],
    metrics: Any,
    insights: Any,
    aggregated: Any,
) -> ValidationResult:
    """WriteResult'ı plan §5-E kurallarıyla denetler (model çağrısı yok).

    Args:
        write_result: D adımı çıktısı; sözlük de kabul edilir.
        reviews: Ham yorumlar (``id`` + ``text`` yeterli; ``Review`` olabilir).
        metrics: A adımı çıktısı (izinli sayı kaynağı).
        insights: A2 adımı çıktısı (izinli sayı kaynağı).
        aggregated: C adımı çıktısı (izinli sayı kaynağı).

    Returns:
        ``ValidationResult``: blok listesi, gizlenen bloklar, uyarılar, oran.
    """
    # --- şema (pydantic) yeniden doğrulanır --------------------------------
    try:
        write = (
            write_result
            if isinstance(write_result, WriteResult)
            else WriteResult.model_validate(write_result)
        )
    except ValidationError as exc:
        first = exc.errors()[0] if exc.errors() else {}
        location = ".".join(str(item) for item in first.get("loc", ())) or "(kök)"
        reason = f"şema geçersiz: {location}: {first.get('msg', str(exc))}"
        return _finish([], [reason], schema_valid=False)

    warnings: list[str] = []
    blocks: list[BlockValidation] = []

    texts = {_review_id(review): _review_text(review) for review in reviews}
    texts.pop(None, None)
    known = set(texts)

    allowed = _allowed_numbers(write, metrics, insights, aggregated)

    # --- övgü temaları ------------------------------------------------------
    for index, theme in enumerate(write.themes_praise):
        name = f"theme_praise:{index}:{theme.name}"
        problems = _ids_problems(theme.review_ids, known)

        quote_id = str(theme.quote_review_id)
        if quote_id not in known:
            problems.append(f"bilinmeyen alıntı review_id: {quote_id}")
        else:
            issue = quote_problem(theme.quote, texts[quote_id])
            if issue:
                problems.append(issue)

        offenders = _offending_numbers([theme.name], allowed)
        if offenders:
            problems.append("küme dışı sayı: " + ", ".join(offenders))

        blocks.append(_block(name, problems, warnings))

    # --- şikayet temaları ---------------------------------------------------
    for index, theme in enumerate(write.themes_complaint):
        name = f"theme_complaint:{index}:{theme.name}"
        problems = _ids_problems(theme.review_ids, known)

        quote_id = str(theme.quote_review_id)
        if quote_id not in known:
            problems.append(f"bilinmeyen alıntı review_id: {quote_id}")
        else:
            issue = quote_problem(theme.quote, texts[quote_id])
            if issue:
                problems.append(issue)

        offenders = _offending_numbers([theme.name, theme.reply_draft], allowed)
        if offenders:
            problems.append("küme dışı sayı: " + ", ".join(offenders))

        blocks.append(_block(name, problems, warnings))

    # --- övülen ürünler -----------------------------------------------------
    product_problems: list[str] = []
    for product in write.products_praised:
        product_problems.extend(_ids_problems(product.review_ids, known))
    product_offenders = _offending_numbers(
        [product.name for product in write.products_praised], allowed
    )
    if product_offenders:
        product_problems.append("küme dışı sayı: " + ", ".join(product_offenders))
    blocks.append(_block("products_praised", product_problems, warnings))

    # --- Instagram kutusu ---------------------------------------------------
    caption_offenders = _offending_numbers([write.instagram_caption], allowed)
    caption_problems = (
        ["küme dışı sayı: " + ", ".join(caption_offenders)]
        if caption_offenders
        else []
    )
    blocks.append(_block("instagram_caption", caption_problems, warnings))

    # --- top_quotes ---------------------------------------------------------
    quote_problems: list[str] = []
    for index, quote in enumerate(write.top_quotes):
        label = f"top_quotes[{index}]"
        review_id = str(quote.review_id)
        if review_id not in known:
            quote_problems.append(f"{label}: bilinmeyen review_id: {review_id}")
            continue
        issue = quote_problem(quote.quote, texts[review_id])
        if issue:
            quote_problems.append(f"{label}: {issue}")
    blocks.append(_block("top_quotes", quote_problems, warnings))

    # --- tek adım -----------------------------------------------------------
    step = write.single_step
    step_problems = _ids_problems(step.evidence_review_ids, known)
    step_offenders = _offending_numbers(
        [step.action, step.reason, step.effort, step.how_to_measure], allowed
    )
    if step_offenders:
        step_problems.append("küme dışı sayı: " + ", ".join(step_offenders))
    blocks.append(_block("single_step", step_problems, warnings))

    # --- yanıtsız yorum taslakları -----------------------------------------
    for index, draft in enumerate(write.unanswered_reply_drafts):
        name = f"unanswered_reply_drafts:{index}"
        problems: list[str] = []
        review_id = str(draft.review_id)
        if review_id not in known:
            problems.append(f"bilinmeyen review_id: {review_id}")
        offenders = _offending_numbers([draft.reply], allowed)
        if offenders:
            problems.append("küme dışı sayı: " + ", ".join(offenders))
        blocks.append(_block(name, problems, warnings))

    return _finish(blocks, warnings)
