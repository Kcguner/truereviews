"""Sağlayıcı katmanının tek arayüzü: `generate_json()` (plan §3).

Akış::

    cache kontrolü -> ratelimit acquire -> adaptör generate()
    -> usage kaydı -> cache yazımı -> LLMResult

Adaptörler retry yapar (tenacity, 429/5xx/ağ); bu modül retry yapmaz.

Adaptör sözleşmesi (her `rapor.providers.<ad>` modülü sağlar)::

    def generate(profile, system: str, user: str, schema: dict | None,
                 thinking: str, max_tokens: int,
                 api_key: str | None) -> AdapterResult

`profile` pydantic modeli veya sözlük olabilir; adaptörler `getattr` ile
okumalı, iki biçimi de desteklemelidir.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Mapping

from pydantic import BaseModel, ConfigDict

from .. import cache as cache_store
from .. import ratelimit as ratelimit_mod
from .. import usage as usage_store
from . import get_adapter

__all__ = [
    "AdapterResult",
    "AdapterUsage",
    "LLMResult",
    "generate_json",
]


class AdapterUsage(BaseModel):
    """Tek çağrının token ve süre kullanımı."""

    model_config = ConfigDict(extra="ignore")

    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    duration_s: float = 0.0


class AdapterResult(BaseModel):
    """Adaptör çıktısı: parse edilmiş JSON + kullanım."""

    model_config = ConfigDict(extra="ignore")

    data: Any
    usage: AdapterUsage


class LLMResult(BaseModel):
    """`generate_json()` dönüşü. `cached=True` ise ağ çağrısı yapılmadı."""

    model_config = ConfigDict(extra="ignore")

    data: Any
    usage: AdapterUsage
    cached: bool = False


# --- profil yardımcıları ---------------------------------------------------


def _field(profile: Any, key: str, default: Any = None) -> Any:
    """Profil alanı: pydantic model ve sözlük biçimini birlikte destekler."""
    if profile is None:
        return default
    if isinstance(profile, Mapping):
        return profile.get(key, default)
    return getattr(profile, key, default)


def _profile_name(profile: Any) -> str:
    name = _field(profile, "name")
    if not name:
        raise ValueError("profil adı yok: profile 'name' alanı gerekli")
    return str(name)


def _resolve_api_key(profile: Any, api_key: str | None) -> str | None:
    if api_key is not None:
        return api_key
    env_name = _field(profile, "api_key_env")
    if env_name:
        value = os.environ.get(str(env_name))
        if value:
            return value
    return None


def _root_for(out_dir: str | Path | None) -> Path:
    """Cache/kota kökü: `out/<slug>` verilirse proje kökü, yoksa cwd."""
    if out_dir is None:
        return Path.cwd()
    path = Path(out_dir).resolve()
    if path.name and path.parent.name == "out":
        return path.parent.parent
    return path


def _state_dir(root: Path) -> Path:
    override = os.environ.get("RAPOR_STATE_DIR")
    if override:
        return Path(override).expanduser()
    return root / ".state"


# --- ana giriş -------------------------------------------------------------


def generate_json(
    profile: Any,
    system: str,
    user: str,
    schema: dict | None = None,
    thinking: str | None = None,
    max_tokens: int | None = None,
    *,
    api_key: str | None = None,
    use_cache: bool = True,
    out_dir: str | Path | None = None,
    step: str | None = None,
) -> LLMResult:
    """Profil üzerinden JSON üretir; cache ve hız sınırları uygulanır.

    Args:
        profile: `ProviderProfile` ya da eşdeğer sözlük.
        system: sistem promptu.
        user: kullanıcı promptu.
        schema: JSON şeması (adaptöre aynen geçer, cache anahtarına girer).
        thinking: profili ezer; `None` ise profil değeri kullanılır.
        max_tokens: profili ezer; `None` ise profil değeri kullanılır.
        api_key: açık anahtar; verilmezse `api_key_env` ortamdan okunur.
        use_cache: `False` ise okuma ve yazma yapılmaz.
        out_dir: `out/<slug>`; usage.json buraya yazılır.
        step: kullanım kaydındaki adım etiketi (`tag` / `write`).
    """
    adapter_name = _field(profile, "adapter")
    if not adapter_name:
        raise ValueError("profilde 'adapter' alanı yok")
    adapter_name = str(adapter_name)
    profile_name = _profile_name(profile)
    model = str(_field(profile, "model") or "")

    resolved_thinking = thinking
    if resolved_thinking is None:
        resolved_thinking = _field(profile, "thinking")
    resolved_thinking = (
        str(resolved_thinking).strip().lower() if resolved_thinking else None
    )

    resolved_max_tokens = max_tokens
    if resolved_max_tokens is None:
        resolved_max_tokens = _field(profile, "max_tokens", 4096)
    resolved_max_tokens = int(resolved_max_tokens)

    root = _root_for(out_dir)
    key = cache_store.key_for(
        adapter=adapter_name,
        model=model,
        thinking=resolved_thinking,
        max_tokens=resolved_max_tokens,
        schema=schema,
        system=system,
        user=user,
    )

    # 1) cache isabeti — ağ ve kota tüketilmez.
    if use_cache:
        hit = cache_store.get(root, key)
        if hit is not None:
            cached_usage = AdapterUsage.model_validate(hit.get("usage") or {})
            if out_dir is not None:
                usage_store.record(
                    out_dir,
                    {
                        "step": step,
                        "profile": profile_name,
                        "model": model,
                        "input_tokens": cached_usage.input_tokens,
                        "output_tokens": cached_usage.output_tokens,
                        "thinking_tokens": cached_usage.thinking_tokens,
                        "duration_s": 0.0,
                        "cached": True,
                        "cost": usage_store.estimate_cost(profile, cached_usage),
                    },
                )
            return LLMResult(
                data=hit.get("data"), usage=cached_usage, cached=True
            )

    # 2) hız sınırı / günlük kota.
    limiter = ratelimit_mod.get_limiter(_state_dir(root))
    limiter.register(profile, name=profile_name)
    limiter.acquire(profile_name)
    try:
        # 3) adaptör çağrısı.
        adapter = get_adapter(adapter_name)
        result = adapter.generate(
            profile,
            system,
            user,
            schema,
            resolved_thinking,
            resolved_max_tokens,
            _resolve_api_key(profile, api_key),
        )
    finally:
        limiter.release(profile_name)

    if isinstance(result, Mapping):
        result = AdapterResult.model_validate(dict(result))
    if not isinstance(result, AdapterResult):
        result = AdapterResult(
            data=getattr(result, "data", None),
            usage=getattr(result, "usage", AdapterUsage()),
        )
    usage: AdapterUsage = result.usage
    if not isinstance(usage, AdapterUsage):
        usage = AdapterUsage.model_validate(usage)

    # 4) cache yazımı.
    if use_cache:
        cache_store.put(root, key, result.data, usage)

    # 5) usage kaydı.
    if out_dir is not None:
        usage_store.record(
            out_dir,
            {
                "step": step,
                "profile": profile_name,
                "model": model,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "thinking_tokens": usage.thinking_tokens,
                "duration_s": usage.duration_s,
                "cached": False,
                "cost": usage_store.estimate_cost(profile, usage),
            },
        )

    return LLMResult(data=result.data, usage=usage, cached=False)
