"""`opencode` CLI adaptörü (plan §3, §10).

`opencode run -m <provider/model> --format json` alt süreç olarak çağrılır.
CLI'da yapılandırılmış çıktı (response schema) yoktur: yanıt metninden JSON
ayıklanır, parse başarısızsa ya da süreç hata verirse en fazla 2 kez yeniden
denenir. Token bilgisi CLI çıktısında yoksa 0 loglanır (plan §10 notu).

`opencode` PATH'te yoksa yalnızca bu profil çağrısında
:class:`OpencodeUnavailableError` fırlar; diğer adaptörler etkilenmez.
`api_key` parametresi yok sayılır: kimlik doğrulama opencode'un kendi
oturumundan gelir.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import time
from typing import Any

from .base import AdapterResult, AdapterUsage

__all__ = [
    "DEFAULT_TIMEOUT_S",
    "MAX_ATTEMPTS",
    "OpencodeError",
    "OpencodeParseError",
    "OpencodeUnavailableError",
    "generate",
    "parse_json_text",
]

DEFAULT_TIMEOUT_S = 300.0
# İlk çağrı + 2 yeniden deneme (plan §10).
MAX_ATTEMPTS = 3

# opencode JSON olaylarında metin taşıyabilecek alanlar.
_TEXT_KEYS: tuple[str, ...] = (
    "text",
    "content",
    "message",
    "response",
    "result",
    "output",
)


class OpencodeError(RuntimeError):
    """opencode çağrısı ya da yanıtı kullanılabilir değil."""


class OpencodeUnavailableError(OpencodeError):
    """`opencode` binary'si PATH'te yok — bu profil kapatılmalı."""


class OpencodeParseError(OpencodeError):
    """Yanıt metninden geçerli JSON ayıklanamadı."""


# ---------------------------------------------------------------------------
# JSON ayıklama
# ---------------------------------------------------------------------------


def _json_candidates(text: str) -> list[str]:
    """Metinden en olasıdan en olasıya JSON adayları üretir."""
    stripped = text.strip()
    candidates: list[str] = []

    # ```json ... ``` fence'leri (etrafındaki metin yok sayılır).
    for match in re.finditer(r"```(?:[A-Za-z0-9_-]+)?\s*(.*?)```", stripped, re.S):
        block = match.group(1).strip()
        if block:
            candidates.append(block)

    # İlk `{` ile son `}` arası: modelin JSON'u cümle içine gömdüğü yaygın hal.
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end > start:
        candidates.append(stripped[start : end + 1])

    # Dizi yanıtı (tag adımı) için ilk `[` ile son `]`.
    start = stripped.find("[")
    end = stripped.rfind("]")
    if start != -1 and end > start:
        candidates.append(stripped[start : end + 1])

    # Son çare: metnin tamamı.
    candidates.append(stripped)
    return [candidate for candidate in candidates if candidate]


def parse_json_text(text: str) -> Any:
    """Metinden JSON ayıklar; hiçbir aday parse edilemezse hata fırlatır."""
    for candidate in _json_candidates(text):
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
    snippet = text.strip().replace("\n", " ")[:160]
    raise OpencodeParseError(
        f"opencode yanıtından JSON ayıklanamadı — yanıt başlangıcı: {snippet!r}"
    )


# ---------------------------------------------------------------------------
# CLI çıktısı
# ---------------------------------------------------------------------------


def _collect_text(node: Any, out: list[str]) -> None:
    """JSON olay ağacından metin parçalarını sırayla toplar."""
    if isinstance(node, str):
        cleaned = node.strip()
        if cleaned:
            out.append(cleaned)
        return
    if isinstance(node, list):
        for item in node:
            _collect_text(item, out)
        return
    if not isinstance(node, dict):
        return

    emitted = False
    for key in _TEXT_KEYS:
        value = node.get(key)
        if isinstance(value, str) and value.strip():
            out.append(value)
            emitted = True
            break
    if emitted:
        return
    # `part` / `delta` gibi sarmalayıcılar.
    for key in ("part", "delta", "data", "message"):
        nested = node.get(key)
        if isinstance(nested, (dict, list)):
            _collect_text(nested, out)


def _extract_response_text(stdout: str) -> str:
    """`--format json` çıktısından asistan mesaj metnini çıkarır.

    Çıktı JSONL (olay başına bir JSON) ya da tek bir JSON nesnesi olabilir.
    JSON olmayan satırlar da metin parçası sayılır.
    """
    stdout = stdout.strip()
    if not stdout:
        return ""

    try:
        parsed = json.loads(stdout)
    except (json.JSONDecodeError, ValueError):
        parsed = None
    if parsed is not None:
        out: list[str] = []
        _collect_text(parsed, out)
        if out:
            return "\n".join(out)
        return stdout

    out = []
    plain: list[str] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            plain.append(line)
            continue
        _collect_text(event, out)
    out.extend(plain)
    return "\n".join(out)


def _find_usage(node: Any) -> dict[str, int] | None:
    """Olay ağacında token bilgisi taşıyan sözlüğü arar."""
    if isinstance(node, list):
        for item in node:
            found = _find_usage(item)
            if found:
                return found
        return None
    if not isinstance(node, dict):
        return None

    input_tokens = node.get("input_tokens", node.get("input"))
    output_tokens = node.get("output_tokens", node.get("output"))
    thinking_tokens = node.get(
        "thinking_tokens", node.get("reasoning_tokens", node.get("reasoning"))
    )
    if any(isinstance(v, (int, float)) for v in (input_tokens, output_tokens)):
        return {
            "input_tokens": int(input_tokens or 0),
            "output_tokens": int(output_tokens or 0),
            "thinking_tokens": int(thinking_tokens or 0),
        }
    for value in node.values():
        found = _find_usage(value)
        if found:
            return found
    return None


def _extract_usage(stdout: str) -> AdapterUsage:
    """CLI çıktısındaki token bilgisini okur; yoksa hepsi 0 (plan §10)."""
    documents: list[Any] = []
    try:
        documents.append(json.loads(stdout))
    except (json.JSONDecodeError, ValueError):
        for line in stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                documents.append(json.loads(line))
            except (json.JSONDecodeError, ValueError):
                continue
    for document in documents:
        found = _find_usage(document)
        if found:
            return AdapterUsage(**found)
    return AdapterUsage()


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------


def _build_prompt(system: str, user: str, schema: dict[str, Any] | None) -> str:
    parts: list[str] = []
    if system.strip():
        parts.append(system.strip())
    if user.strip():
        parts.append(user.strip())
    instruction = (
        "Yanıtı YALNIZCA geçerli bir JSON olarak ver. "
        "JSON dışında açıklama, selamlama veya markdown yazma."
    )
    if schema:
        instruction += "\nBeklenen JSON şeması:\n" + json.dumps(
            schema, ensure_ascii=False, indent=2
        )
    parts.append(instruction)
    return "\n\n".join(parts)


def _timeout(profile: Any) -> float:
    value = getattr(profile, "timeout_s", None) or getattr(profile, "timeout", None)
    try:
        timeout = float(value)
    except (TypeError, ValueError):
        return DEFAULT_TIMEOUT_S
    return timeout if timeout > 0 else DEFAULT_TIMEOUT_S


def _binary() -> str:
    path = shutil.which("opencode")
    if not path:
        raise OpencodeUnavailableError(
            "opencode bulunamadı — bu profil kapatıldı. "
            "`opencode` CLI'yı PATH'e ekleyin veya farklı bir profil seçin. "
            "Diğer adaptörler (gemini, openai_compat, mock) etkilenmez."
        )
    return path


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
    """`opencode run` ile bir JSON yanıtı üretir.

    Args:
        profile: `ProviderProfile`; `model` zorunlu, `timeout_s` isteğe bağlı.
        system/user: prompt parçaları.
        schema: JSON şeması; verilirse prompt metnine gömülür.
        thinking: opencode CLI'da ayrı bayrağı yok; prompta not düşülür.
        max_tokens: CLI'da üst sınır bayrağı yok; yalnızca kullanım kaydı için.
        api_key: yok sayılır (kimlik opencode oturumundan gelir).
    """
    del api_key, max_tokens  # opencode CLI bu parametreleri kabul etmez.

    binary = _binary()
    timeout = _timeout(profile)
    model = getattr(profile, "model", "") or ""
    prompt = _build_prompt(system, user, schema)
    if thinking:
        prompt = f"Düşünme düzeyi: {thinking}\n\n{prompt}"

    command = [binary, "run", "-m", model, "--format", "json", prompt]

    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        started = time.monotonic()
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            last_error = OpencodeError(
                f"opencode zaman aşımı ({timeout:.0f} sn, deneme {attempt}/{MAX_ATTEMPTS})"
            )
            last_error.__cause__ = exc
            continue
        except OSError as exc:
            raise OpencodeUnavailableError(
                f"opencode çalıştırılamadı: {exc}"
            ) from exc

        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "").strip()
            detail = detail.splitlines()[-1] if detail else ""
            last_error = OpencodeError(
                f"opencode çıkış kodu {completed.returncode} "
                f"(deneme {attempt}/{MAX_ATTEMPTS})"
                + (f": {detail}" if detail else "")
            )
            continue

        text = _extract_response_text(completed.stdout)
        try:
            data = parse_json_text(text)
        except OpencodeParseError as exc:
            last_error = exc
            continue

        duration = time.monotonic() - started
        usage = _extract_usage(completed.stdout)
        usage.duration_s = duration
        return AdapterResult(data=data, usage=usage)

    assert last_error is not None  # döngü en az bir kez koştu
    raise OpencodeError(
        f"opencode {MAX_ATTEMPTS} denemede geçerli JSON üretemedi — {last_error}"
    ) from last_error
