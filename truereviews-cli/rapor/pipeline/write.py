"""D adımı — sabit JSON şemasıyla rapor metni yazımı (plan §5-D).

Akış::

    profil (config.steps.write) -> write_system/write_user
    -> generate_json (cache + hız sınırı + usage)
    -> WriteResult.model_validate; hata → tek yeniden deneme
    -> WriteResult

`strength` rozeti ve sayıları model çıktısı değildir: C adımı bunları
``report.json``'a koddan ekler (İlke 1). Bu modül yalnızca ``WriteResult``
döndürür; birleştirmeyi çağıran (cli/report) yapar.
"""

from __future__ import annotations

import json
from typing import Any, Iterable, Mapping

from pydantic import ValidationError

from rapor.prompts import write_system, write_user
from rapor.providers.base import generate_json
from rapor.schemas import WriteResult, write_result_schema

__all__ = ["WriteError", "collect_evidence_reviews", "write_report"]

# write tek parça çağrıdır; başarısız şemada bir kez daha denenir (plan §5-D).
MAX_ATTEMPTS = 2


class WriteError(RuntimeError):
    """İki denemeden sonra da geçerli ``WriteResult`` üretilemedi."""


# ---------------------------------------------------------------------------
# Config / profil
# ---------------------------------------------------------------------------


def _read(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _write_profile(config: Any) -> Any:
    """`config.steps.write.profile` profilini döner (model veya sözlük config)."""
    if hasattr(config, "profile_for_step"):
        return config.profile_for_step("write")

    steps = _read(config, "steps")
    write_step = _read(steps, "write")
    profile_name = _read(write_step, "profile")
    if not profile_name:
        raise WriteError("config.steps.write.profile tanımlı değil")

    if hasattr(config, "profile"):
        return config.profile(str(profile_name))

    providers = _read(config, "providers", {}) or {}
    profile = _read(providers, str(profile_name))
    if profile is None:
        raise WriteError(f"'{profile_name}' profili config.providers içinde yok")
    return profile


# ---------------------------------------------------------------------------
# Girdi hazırlığı
# ---------------------------------------------------------------------------


def _dump(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, Mapping):
        return dict(value)
    return value


def _record(review: Any) -> dict[str, Any] | None:
    """Gizlilik süzgeci: `{id, text, stars, month, answered}` (plan §4)."""
    if isinstance(review, Mapping):
        review_id = review.get("id")
        text = review.get("text")
        stars = review.get("stars")
        month = review.get("month", "")
        answered = review.get("answered", False)
    else:
        review_id = getattr(review, "id", None)
        text = getattr(review, "text", None)
        stars = getattr(review, "stars", None)
        month = getattr(review, "month", "")
        answered = getattr(review, "answered", False)

    if review_id is None or not str(text or "").strip():
        return None
    try:
        stars_value = float(stars)
    except (TypeError, ValueError):
        stars_value = 3.0
    return {
        "id": str(review_id),
        "text": str(text),
        "stars": max(1.0, min(5.0, stars_value)),
        "month": str(month or ""),
        "answered": bool(answered),
    }


def _walk_evidence(node: Any, out: list[dict[str, Any]], seen: set[str]) -> None:
    """Ağaçta `evidence_reviews` listelerini ve `unanswered_list` kayıtlarını toplar."""
    if isinstance(node, Mapping):
        for key, value in node.items():
            if key in ("evidence_reviews", "unanswered_list") and isinstance(
                value, (list, tuple)
            ):
                for item in value:
                    record = _record(item)
                    if record is not None and record["id"] not in seen:
                        seen.add(record["id"])
                        out.append(record)
                continue
            if isinstance(value, (Mapping, list, tuple)):
                _walk_evidence(value, out, seen)
        return
    if isinstance(node, (list, tuple)):
        for item in node:
            _walk_evidence(item, out, seen)


def collect_evidence_reviews(
    aggregated: Any, reviews: Iterable[Any] = ()
) -> list[dict[str, Any]]:
    """C çıktısındaki kanıt yorumlarını ham metinleriyle toplar.

    Sıra: ``evidence_reviews`` kümeleri + ``unanswered_list``. Hiçbiri yoksa
    (eski/sade aggregate) tüm ``reviews`` listesine düşer — birebir alıntı
    için ham metin şarttır (plan §5-D).
    """
    collected: list[dict[str, Any]] = []
    seen: set[str] = set()
    _walk_evidence(_dump(aggregated), collected, seen)

    if not collected:
        for review in reviews:
            record = _record(review)
            if record is not None and record["id"] not in seen:
                seen.add(record["id"])
                collected.append(record)
    return collected


def _aggregate_payload(metrics: Any, insights: Any, aggregated: Any) -> dict[str, Any]:
    """Modele giden hesaplanmış veri: metrikler + içgörüler + konu kümeleri."""
    return {
        "metrics": _dump(metrics),
        "insights": _dump(insights),
        "topics": _dump(aggregated),
    }


# ---------------------------------------------------------------------------
# Yanıt ayrıştırma
# ---------------------------------------------------------------------------


def _parse_data(data: Any) -> dict[str, Any]:
    if isinstance(data, WriteResult):
        return data.model_dump(mode="json")
    if isinstance(data, Mapping):
        return dict(data)
    if isinstance(data, str):
        text = data.strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("model yanıtında JSON nesnesi yok")
        parsed = json.loads(text[start : end + 1])
        if not isinstance(parsed, dict):
            raise ValueError("model yanıtı JSON nesnesi değil")
        return parsed
    raise ValueError(f"beklenmeyen model yanıtı tipi: {type(data).__name__}")


def _retry_user_prompt(base: str, error: str, lang: str) -> str:
    """Başarısız denemeden sonra kısa düzeltme notu eklenmiş kullanıcı promptu."""
    note = (
        "Önceki çıktı şemayı geçmedi. Hatayı düzelt ve yalnızca geçerli JSON "
        "nesnesi yaz."
        if lang != "en"
        else "The previous output failed schema validation. Fix the error and "
        "write only a valid JSON object."
    )
    return f"{base}\n\n### {note}\n{error[:800]}"


# ---------------------------------------------------------------------------
# Ana fonksiyon
# ---------------------------------------------------------------------------


def write_report(
    metrics: Any,
    insights: Any,
    aggregated: Any,
    reviews: Iterable[Any],
    config: Any,
    out_dir: Any,
    *,
    lang: str = "tr",
    use_cache: bool = True,
) -> WriteResult:
    """Metrik + içgörü + konu kümelerinden doğrulanmış ``WriteResult`` üretir.

    Args:
        metrics: A adımı çıktısı.
        insights: A2 adımı çıktısı.
        aggregated: C adımı çıktısı (``evidence_reviews`` alanı buradan okunur).
        reviews: Ham yorumlar; aggregate kanıt taşımıyorsa yedek kaynak.
        config: ``steps.write.profile`` taşıyan config.
        out_dir: ``out/<slug>``; usage kaydı buraya yazılır.
        lang: Rapor dili ("tr" / "en"); taslak ve metinleri belirler.
        use_cache: ``False`` ise disk cache okunmaz/yazılmaz.

    Raises:
        WriteError: iki denemede de geçerli ``WriteResult`` alınamazsa.
    """
    profile = _write_profile(config)
    system = write_system(lang)
    evidence = collect_evidence_reviews(aggregated, reviews)
    if not evidence:
        raise WriteError("kanıt yorumu yok: write promptu için ham metin gerekli")

    user = write_user(_aggregate_payload(metrics, insights, aggregated), evidence, lang)
    schema = write_result_schema()

    last_error = ""
    for attempt in range(MAX_ATTEMPTS):
        prompt = user if attempt == 0 else _retry_user_prompt(user, last_error, lang)
        try:
            result = generate_json(
                profile,
                system,
                prompt,
                schema,
                use_cache=use_cache,
                out_dir=out_dir,
                step="write",
            )
            return WriteResult.model_validate(_parse_data(result.data))
        except (ValidationError, ValueError, json.JSONDecodeError) as exc:
            last_error = str(exc)

    raise WriteError(
        f"write çıktısı {MAX_ATTEMPTS} denemede doğrulanamadı: {last_error[:400]}"
    )
