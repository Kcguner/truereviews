"""Token / süre / maliyet kaydı (plan §3, §7).

Her LLM çağrısı `out/<slug>/usage.json` içine bir satır olarak eklenir; dosya
aynı zamanda toplam bölümünü taşır:

    {"calls": [...], "totals": {...}}

Yazma atomiktir (geçici dosya + `os.replace`). Fiyat profilde yoksa
`cost` alanı `None` olur; toplam maliyet tüm çağrılarda fiyat varsa sayıdır.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Mapping

__all__ = [
    "USAGE_FILENAME",
    "append",
    "estimate_cost",
    "load",
    "normalize_entry",
    "record",
    "summary",
]

USAGE_FILENAME = "usage.json"

_TOKEN_KEYS = (
    "input_tokens",
    "output_tokens",
    "thinking_tokens",
)

# Girdi anahtarı eşlemeleri: plan §3 Türkçe kısa adları da kabul edilir.
_ALIASES: dict[str, str] = {
    "adim": "step",
    "adım": "step",
    "step": "step",
    "profil": "profile",
    "profile": "profile",
    "model": "model",
    "in": "input_tokens",
    "girdi": "input_tokens",
    "input": "input_tokens",
    "input_tokens": "input_tokens",
    "out": "output_tokens",
    "cikti": "output_tokens",
    "çıktı": "output_tokens",
    "output": "output_tokens",
    "output_tokens": "output_tokens",
    "thinking": "thinking_tokens",
    "dusunme": "thinking_tokens",
    "düşünme": "thinking_tokens",
    "thinking_tokens": "thinking_tokens",
    "sure": "duration_s",
    "süre": "duration_s",
    "duration": "duration_s",
    "duration_s": "duration_s",
    "cached": "cached",
    "tahmini_maliyet": "cost",
    "maliyet": "cost",
    "cost": "cost",
}


def normalize_entry(entry: Mapping[str, Any] | Any) -> dict[str, Any]:
    """Girişi sabit anahtarlı sözlüğe indirger (eksik alanlar varsayılan)."""
    if hasattr(entry, "model_dump"):
        entry = entry.model_dump()
    raw = dict(entry)
    out: dict[str, Any] = {
        "step": None,
        "profile": None,
        "model": None,
        "input_tokens": 0,
        "output_tokens": 0,
        "thinking_tokens": 0,
        "duration_s": 0.0,
        "cached": False,
        "cost": None,
    }
    for key, value in raw.items():
        target = _ALIASES.get(str(key))
        if target is not None:
            out[target] = value
    for key in _TOKEN_KEYS:
        try:
            out[key] = int(out[key] or 0)
        except (TypeError, ValueError):
            out[key] = 0
    try:
        out["duration_s"] = float(out["duration_s"] or 0.0)
    except (TypeError, ValueError):
        out["duration_s"] = 0.0
    out["cached"] = bool(out["cached"])
    if out["cost"] is not None:
        try:
            out["cost"] = float(out["cost"])
        except (TypeError, ValueError):
            out["cost"] = None
    return out


def estimate_cost(profile: Any, usage: Any) -> float | None:
    """Profil fiyatından USD maliyet. Fiyat yoksa `None`.

    `pricing: {input, output}` değerleri 1M token başına USD'dir. Düşünme
    token'ları çıkış fiyatından sayılır.
    """
    if profile is None:
        return None
    if isinstance(profile, Mapping):
        pricing = profile.get("pricing")
    else:
        pricing = getattr(profile, "pricing", None)
    if pricing is None:
        return None
    if isinstance(pricing, Mapping):
        input_price = pricing.get("input")
        output_price = pricing.get("output")
    else:
        input_price = getattr(pricing, "input", None)
        output_price = getattr(pricing, "output", None)
    if input_price is None or output_price is None:
        return None
    if isinstance(usage, Mapping):
        input_tokens = int(usage.get("input_tokens") or 0)
        output_tokens = int(usage.get("output_tokens") or 0)
        thinking_tokens = int(usage.get("thinking_tokens") or 0)
    else:
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        thinking_tokens = int(getattr(usage, "thinking_tokens", 0) or 0)
    try:
        cost = (
            input_tokens * float(input_price)
            + (output_tokens + thinking_tokens) * float(output_price)
        ) / 1_000_000.0
    except (TypeError, ValueError):
        return None
    return cost


# --- dosya ----------------------------------------------------------------


def _path(out_dir: str | Path) -> Path:
    return Path(out_dir) / USAGE_FILENAME


def load(out_dir: str | Path) -> dict[str, Any]:
    """`usage.json` içeriği; dosya yoksa boş yapı."""
    path = _path(out_dir)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        return {"calls": [], "totals": _totals([])}
    if not isinstance(payload, dict):
        return {"calls": [], "totals": _totals([])}
    calls = payload.get("calls")
    if not isinstance(calls, list):
        calls = []
    return {"calls": calls, "totals": _totals(calls)}


def _totals(calls: list[Mapping[str, Any]]) -> dict[str, Any]:
    totals: dict[str, Any] = {
        "calls": len(calls),
        "cached_calls": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "thinking_tokens": 0,
        "total_tokens": 0,
        "duration_s": 0.0,
        "cost": None,
    }
    cost_sum = 0.0
    cost_seen = False
    for raw in calls:
        entry = normalize_entry(raw)
        totals["cached_calls"] += 1 if entry["cached"] else 0
        totals["input_tokens"] += entry["input_tokens"]
        totals["output_tokens"] += entry["output_tokens"]
        totals["thinking_tokens"] += entry["thinking_tokens"]
        totals["duration_s"] += entry["duration_s"]
        if entry["cost"] is not None:
            cost_sum += entry["cost"]
            cost_seen = True
    totals["total_tokens"] = (
        totals["input_tokens"]
        + totals["output_tokens"]
        + totals["thinking_tokens"]
    )
    totals["duration_s"] = round(totals["duration_s"], 3)
    totals["cost"] = round(cost_sum, 6) if cost_seen else None
    return totals


def record(out_dir: str | Path, entry: Mapping[str, Any] | Any) -> dict[str, Any]:
    """Bir çağrıyı kaydeder ve güncel toplamları döner.

    `out_dir` yoksa oluşturulur. Yazma atomiktir.
    """
    directory = Path(out_dir)
    directory.mkdir(parents=True, exist_ok=True)
    payload = load(directory)
    payload["calls"].append(normalize_entry(entry))
    payload["totals"] = _totals(payload["calls"])

    target = _path(directory)
    fd, tmp_name = tempfile.mkstemp(prefix=".usage.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(tmp_name, target)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    return payload["totals"]


# `append`, `record` ile aynı işi yapar; eski çağrılar için ad korunur.
append = record


def summary(out_dir: str | Path) -> dict[str, Any]:
    """Toplam token / süre / maliyet (çağrı yoksa sıfırlar, maliyet `None`)."""
    return load(out_dir)["totals"]
