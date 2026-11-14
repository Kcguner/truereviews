"""B — yorum etiketleme (plan §5-B).

Akış::

    yorumlar -> group_size'lük gruplar -> prompts.tag_user
    -> providers.generate_json (profil steps.tag, düşünme profilden)
    -> pydantic TagItem doğrulaması -> RunState.record_group

Hatalı grup `max_group_retries` kez yeniden denenir. İlk deneme cache'i
kullanır; doğrulama hatasından sonraki denemeler cache'i atlar, böylece
bozuk bir yanıt diske yazılmış olsa bile tekrar takılıp kalmaz. Yine de
olmazsa grup etiketsiz kalır ve `warnings` içine satır eklenir.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from pydantic import ValidationError

from rapor import state as run_state
from rapor.prompts import tag_system, tag_user
from rapor.providers import generate_json
from rapor.schemas import TagItem

__all__ = ["TagResult", "tag_reviews", "tag_schema"]


class TagResult(list):
    """Etiketlenmiş yorumların listesi + grup uyarıları.

    `list[TagItem]` gibi davranır (`len`, indeks, döngü); `warnings`
    review.md'ye yazılacak insan okunur satırları taşır.
    """

    def __init__(
        self,
        items: Iterable[TagItem] = (),
        warnings: Iterable[str] = (),
    ) -> None:
        super().__init__(items)
        self.warnings: list[str] = list(warnings)

    @property
    def items(self) -> list[TagItem]:
        return list(self)

    def by_id(self) -> dict[str, TagItem]:
        return {str(item.id): item for item in self}


def tag_schema() -> dict[str, Any]:
    """LLM'e verilen JSON şeması: `TagItem` dizisi (pydantic v2)."""
    return {
        "type": "array",
        "items": TagItem.model_json_schema(),
    }


def _review_id(review: Any) -> str:
    if isinstance(review, Mapping):
        return str(review.get("id", ""))
    return str(getattr(review, "id", ""))


def _validate_group(data: Any, group: Sequence[Any]) -> list[TagItem]:
    """Grup çıktısını doğrular; eksik/fazla/çift id `ValueError`."""
    if not isinstance(data, list):
        raise ValueError(f"çıktı JSON dizisi değil: {type(data).__name__}")

    items: list[TagItem] = [TagItem.model_validate(raw) for raw in data]
    ids = [str(item.id) for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError("çıktıda tekrarlanan id var")

    expected = [_review_id(review) for review in group]
    missing = sorted(set(expected) - set(ids))
    extra = sorted(set(ids) - set(expected))
    if missing or extra:
        parts: list[str] = []
        if missing:
            parts.append(f"eksik id: {', '.join(missing[:3])}")
        if extra:
            parts.append(f"fazla id: {', '.join(extra[:3])}")
        raise ValueError("grup kapsamı tutmuyor — " + "; ".join(parts))

    by_id = {str(item.id): item for item in items}
    return [by_id[review_id_value] for review_id_value in expected]


def _tag_group(
    group: Sequence[Any],
    *,
    index: int,
    total_groups: int,
    profile: Any,
    system: str,
    schema: dict[str, Any],
    out_dir: Path,
    lang: str,
    use_cache: bool,
    max_retries: int,
) -> tuple[list[TagItem] | None, str | None]:
    """Tek grubu etiketler. Başarısızsa `(None, uyarı)` döner."""
    user = tag_user(group, lang)
    attempts = 1 + max(0, int(max_retries))
    last_error: str | None = None

    for attempt in range(attempts):
        try:
            result = generate_json(
                profile,
                system,
                user,
                schema=schema,
                thinking=None,  # düşünme profilden gelir (plan §5-B)
                out_dir=out_dir,
                step="tag",
                use_cache=use_cache and attempt == 0,
            )
            return _validate_group(result.data, group), None
        except (ValidationError, ValueError, TypeError, KeyError) as exc:
            last_error = str(exc).strip().splitlines()[0] if str(exc) else type(exc).__name__

    warning = (
        f"tag: grup {index + 1}/{total_groups} etiketlenemedi "
        f"({attempts} deneme) — {len(group)} yorum etiketsiz"
    )
    if last_error:
        warning += f": {last_error}"
    return None, warning


def tag_reviews(
    reviews: Sequence[Any],
    config: Any,
    out_dir: str | Path,
    *,
    use_cache: bool = True,
    lang: str = "tr",
) -> TagResult:
    """Yorumları gruplar hâlinde etiketler; state'ten devam eder.

    Args:
        reviews: `Review` nesneleri (ya da id/text/stars/month/answered taşıyan
            sözlükler).
        config: `Config`; `tagging.group_size`, `tagging.max_group_retries`
            ve `steps.tag.profile` kullanılır.
        out_dir: `out/<slug>/`; `state.json` ve `usage.json` buraya yazılır.
        use_cache: sağlayıcı cache'i (ilk denemede).
        lang: etiket dili (`tr`/`en`).

    Returns:
        `TagResult`: girdi sırasında `TagItem` listesi + `warnings`.
        Etiketlenemeyen grubun yorumları sonuçta yer almaz.
    """
    review_list = list(reviews)
    if not review_list:
        return TagResult()

    group_size = int(getattr(config.tagging, "group_size", 20))
    max_retries = int(getattr(config.tagging, "max_group_retries", 2))
    groups = [
        review_list[start : start + group_size]
        for start in range(0, len(review_list), group_size)
    ]
    total_groups = len(groups)

    directory = Path(out_dir)
    directory.mkdir(parents=True, exist_ok=True)
    state = run_state.RunState(directory)

    profile = config.profile_for_step("tag")
    system = tag_system(lang)
    schema = tag_schema()

    warnings: list[str] = []
    for index, group in enumerate(groups):
        if state.is_done(index) and state.group_result(index) is not None:
            continue

        items, warning = _tag_group(
            group,
            index=index,
            total_groups=total_groups,
            profile=profile,
            system=system,
            schema=schema,
            out_dir=directory,
            lang=lang,
            use_cache=use_cache,
            max_retries=max_retries,
        )
        if items is not None:
            state.record_group(index, items)
        elif warning:
            warnings.append(warning)

    return TagResult(_assemble(groups, state), warnings)


def _assemble(groups: Sequence[Sequence[Any]], state: run_state.RunState) -> list[TagItem]:
    """State'teki grup sonuçlarını girdi sırasına göre birleştirir.

    Yalnızca mevcut yorumlara ait id'ler alınır; her id en çok bir kez
    döner (eksik/fazla id state'ten gelse bile sonuç bozulmaz).
    """
    by_id: dict[str, TagItem] = {}
    for index, group in enumerate(groups):
        if not state.is_done(index):
            continue
        raw_items = state.group_result(index)
        if not raw_items:
            continue
        wanted = {_review_id(review) for review in group}
        for raw in raw_items:
            try:
                item = TagItem.model_validate(raw)
            except ValidationError:
                continue
            key = str(item.id)
            if key in wanted and key not in by_id:
                by_id[key] = item

    out: list[TagItem] = []
    seen: set[str] = set()
    for review in (review for group in groups for review in group):
        key = _review_id(review)
        if key in seen or key not in by_id:
            continue
        seen.add(key)
        out.append(by_id[key])
    return out
