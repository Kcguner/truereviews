"""LLM yanıtları için disk cache (plan §3).

Anahtar `sha256(adapter, model, thinking, max_tokens, schema, system, user)`.
Serileştirme sıralı JSON'dur (`sort_keys=True`, ayırıcılar sabit), böylece aynı
girdi her zaman aynı anahtarı üretir. Dosya yolu:

    <root>/.cache/llm/<key>.json

Dosya içeriği `{"data": ..., "usage": {...}}`. `use_cache=False` kararı
:mod:`rapor.providers.base` tarafındadır; bu modül yalnızca okuma/yazma yapar.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Mapping

__all__ = [
    "CACHE_DIRNAME",
    "cache_dir",
    "cache_path",
    "clear",
    "get",
    "key_for",
    "put",
    "stats",
]

CACHE_DIRNAME = ".cache"
_SUBDIR = "llm"


def _dumps(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )


def key_for(
    adapter: str,
    model: str,
    thinking: str | None,
    max_tokens: int | None,
    schema: Any,
    system: str,
    user: str,
) -> str:
    """Deterministik cache anahtarı (sha256 hex)."""
    payload = {
        "adapter": adapter,
        "model": model,
        "thinking": thinking,
        "max_tokens": max_tokens,
        "schema": schema,
        "system": system,
        "user": user,
    }
    return hashlib.sha256(_dumps(payload).encode("utf-8")).hexdigest()


def cache_dir(root: str | Path) -> Path:
    return Path(root) / CACHE_DIRNAME / _SUBDIR


def cache_path(root: str | Path, key: str) -> Path:
    return cache_dir(root) / f"{key}.json"


def get(root: str | Path, key: str) -> dict[str, Any] | None:
    """Cache kaydı varsa `{"data", "usage"}` döner, yoksa `None`."""
    path = cache_path(root, key)
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(payload, dict) or "data" not in payload:
        return None
    return payload


def put(
    root: str | Path,
    key: str,
    data: Any,
    usage: Mapping[str, Any] | Any,
) -> Path:
    """Cache kaydını atomik yazar (geçici dosya + rename)."""
    directory = cache_dir(root)
    directory.mkdir(parents=True, exist_ok=True)
    if hasattr(usage, "model_dump"):
        usage = usage.model_dump()
    payload = {"data": data, "usage": dict(usage)}
    target = cache_path(root, key)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{key}.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(_dumps(payload))
        os.replace(tmp_name, target)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    return target


def clear(root: str | Path) -> int:
    """Cache dosyalarını siler; silinen dosya sayısını döner."""
    directory = cache_dir(root)
    if not directory.is_dir():
        return 0
    removed = 0
    for path in directory.glob("*.json"):
        try:
            path.unlink()
            removed += 1
        except OSError:
            continue
    return removed


def stats(root: str | Path) -> dict[str, int]:
    """`{"files": n, "bytes": n}` — cache dizinindeki JSON dosyaları."""
    directory = cache_dir(root)
    files = 0
    total = 0
    if directory.is_dir():
        for path in directory.glob("*.json"):
            try:
                total += path.stat().st_size
                files += 1
            except OSError:
                continue
    return {"files": files, "bytes": total}
