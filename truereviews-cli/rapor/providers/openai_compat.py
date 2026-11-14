"""OpenAI uyumlu adaptör: GLM (Z.ai), DeepSeek, OpenRouter (plan §3).

Sözleşme:

    generate(profile, system, user, schema, thinking, max_tokens, api_key)
        -> AdapterResult

- `base_url` zorunlu; openai SDK `OpenAI(base_url=..., api_key=...)` ile kurulur.
- Sağlayıcıya özel thinking/reasoning parametreleri `profile.extra_body` içinden
  olduğu gibi istek gövdesine eklenir. Adaptör kendi kendine reasoning parametresi
  üretmez; `thinking` yalnızca imza uyumu için taşınır.
- JSON çıkışı: `schema` verilmişse önce `response_format={"type": "json_object"}`
  denenir. Sağlayıcı bu parametreyi reddederse (400 + ilgili mesaj ya da SDK
  `TypeError`) tek seferlik fallback ile `response_format`'sız istek atılır.
- Retry: 429, 5xx, ağ/zaman aşımı ve JSON parse hatası → üstel geri çekilme
  (4 deneme). Diğer 4xx retry edilmez, `AdapterError` fırlatılır.
- Şema doğrulaması (pydantic) çağıran pipeline'ın işidir; burada yalnızca
  `json.loads` yapılır.
"""

from __future__ import annotations

import json
import time
from typing import Any

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
from tenacity import Retrying, retry_if_exception, stop_after_attempt, wait_exponential

from .base import AdapterResult, AdapterUsage

#: Üst üste deneme sayısı (ilk istek dahil).
ATTEMPTS = 4

#: Retry beklemesi. Testler `openai_compat.RETRY_WAIT` değerini monkeypatch'ler.
RETRY_WAIT = wait_exponential(multiplier=1, min=1, max=30)

#: İstek zaman aşımı (saniye).
TIMEOUT_S = 180.0

#: `response_format` reddi sayılan gövde parçaları (küçük harf).
_RESPONSE_FORMAT_HINTS: tuple[str, ...] = (
    "response_format",
    "json_object",
    "json mode",
    "unsupported",
    "not supported",
    "unknown parameter",
    "unrecognized",
)


class AdapterError(RuntimeError):
    """Kullanıcıya gösterilecek adaptör hatası (net mesaj taşır)."""


class _JsonModeUnsupported(Exception):
    """Sağlayıcı `response_format` reddetti: bir kez fallback denenir."""


class _JsonParseError(Exception):
    """Yanıt içeriği geçerli JSON değil; retry kapsamında."""


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, _JsonParseError):
        return True
    if isinstance(exc, _JsonModeUnsupported):
        # Tek seferlik fallback; ATTEMPTS sınırı sonsuz döngüyü engeller.
        return True
    if isinstance(exc, (APITimeoutError, APIConnectionError)):
        return True
    if isinstance(exc, APIStatusError):
        status = exc.status_code
        return status == 429 or status >= 500
    return False


def _error_body(exc: APIStatusError) -> str:
    try:
        payload = exc.response.json()
    except Exception:  # gövde JSON değilse metin kullan
        return (exc.response.text or "").strip()[:400]
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])[:400]
        if payload.get("message"):
            return str(payload["message"])[:400]
    return str(payload)[:400]


def _is_response_format_rejection(exc: APIStatusError) -> bool:
    if exc.status_code not in (400, 404, 422):
        return False
    message = _error_body(exc).lower()
    return any(hint in message for hint in _RESPONSE_FORMAT_HINTS)


def _usage_from(response: Any) -> AdapterUsage:
    usage = getattr(response, "usage", None)
    input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)

    thinking_tokens = 0
    details = getattr(usage, "completion_tokens_details", None)
    if details is not None:
        reasoning = getattr(details, "reasoning_tokens", None)
        if reasoning is None and isinstance(details, dict):
            reasoning = details.get("reasoning_tokens")
        thinking_tokens = int(reasoning or 0)

    return AdapterUsage(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        thinking_tokens=thinking_tokens,
    )


def _content_to_json(content: str | None) -> Any:
    if not content or not content.strip():
        raise _JsonParseError("yanıt içeriği boş — JSON bekleniyordu")
    text = content.strip()
    # Bazı uçlar JSON'u ```json ... ``` bloğuna sarar.
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```").strip()
        if text.endswith("```"):
            text = text[: -len("```")].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise _JsonParseError(f"JSON parse hatası: {exc}") from exc


def _build_client(profile: Any, api_key: str) -> OpenAI:
    """Tek HTTP istemcisi. `max_retries=0`: retry yalnızca tenacity katmanında.

    Ayrı bir fonksiyon, testlerin gerçek SDK istemcisini sahte transport ile
    kurabilmesi içindir (ağ kesilir, SDK yolu gerçek kalır).
    """
    return OpenAI(
        base_url=profile.base_url,
        api_key=api_key,
        timeout=TIMEOUT_S,
        max_retries=0,
    )


def _missing_key_message(profile: Any) -> str:
    env_name = getattr(profile, "api_key_env", None)
    if not env_name:
        env_name = f"{str(getattr(profile, 'name', 'PROVIDER')).upper()}_API_KEY"
    return f"{env_name} tanımlı değil — .env dosyasına ekleyin"


def generate(
    profile: Any,
    system: str,
    user: str,
    schema: dict | None,
    thinking: str,
    max_tokens: int,
    api_key: str | None,
) -> AdapterResult:
    """Tek JSON üretim çağrısı; doğrulanmış `AdapterResult` döndürür."""
    if not api_key:
        raise AdapterError(_missing_key_message(profile))

    base_url = getattr(profile, "base_url", None)
    if not base_url:
        raise AdapterError(
            f"'{getattr(profile, 'name', '?')}' profili için base_url zorunlu "
            "(adapter: openai_compat)"
        )

    client = _build_client(profile, api_key)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    extra_body = dict(getattr(profile, "extra_body", None) or {})
    # `None` bilinçli olarak desteklenen "parametre gönderme" işaretidir.
    state: dict[str, Any] = {"use_json_mode": bool(schema)}

    def _post() -> Any:
        kwargs: dict[str, Any] = {
            "model": profile.model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if state["use_json_mode"]:
            kwargs["response_format"] = {"type": "json_object"}
        if extra_body:
            kwargs["extra_body"] = extra_body
        try:
            return client.chat.completions.create(**kwargs)
        except TypeError:
            # SDK/istek imzası parametreyi tanımıyorsa fallback'e düş.
            if state["use_json_mode"]:
                state["use_json_mode"] = False
                raise _JsonModeUnsupported("response_format SDK tarafından reddedildi")
            raise
        except APIStatusError as exc:
            if state["use_json_mode"] and _is_response_format_rejection(exc):
                state["use_json_mode"] = False
                raise _JsonModeUnsupported(_error_body(exc)) from exc
            if _is_retryable(exc):
                raise
            raise AdapterError(
                f"{profile.model} isteği reddedildi (HTTP {exc.status_code}): "
                f"{_error_body(exc) or exc}"
            ) from exc

    started = time.monotonic()
    retrying = Retrying(
        stop=stop_after_attempt(ATTEMPTS),
        wait=RETRY_WAIT,
        retry=retry_if_exception(_is_retryable),
        reraise=True,
    )
    try:
        for attempt in retrying:
            with attempt:
                response = _post()
                choices = getattr(response, "choices", None) or []
                content = choices[0].message.content if choices else None
                data = _content_to_json(content)
                usage = _usage_from(response)
    except (_JsonParseError, _JsonModeUnsupported) as exc:
        raise AdapterError(f"{profile.model}: JSON çıktı alınamadı — {exc}") from exc
    except (APITimeoutError, APIConnectionError) as exc:
        raise AdapterError(
            f"{profile.model}: sağlayıcıya ulaşılamadı ({type(exc).__name__}) — {exc}"
        ) from exc
    except APIStatusError as exc:
        raise AdapterError(
            f"{profile.model}: istek {ATTEMPTS} denemede başarısız "
            f"(HTTP {exc.status_code}): {_error_body(exc) or exc}"
        ) from exc

    usage.duration_s = round(time.monotonic() - started, 3)
    return AdapterResult(data=data, usage=usage)
