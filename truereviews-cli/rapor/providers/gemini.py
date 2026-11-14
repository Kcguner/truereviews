"""Gemini adaptörü — google-genai SDK (plan §3).

Tek çağrı: `generate(profile, system, user, schema, thinking, max_tokens, api_key)`.

- Yapılandırılmış çıktı: `response_mime_type="application/json"` +
  `response_schema` (JSON şema dict veya pydantic model sınıfı).
- `thinking` → `ThinkingConfig.thinking_level` (low/medium/high).
  `minimal` yalnızca `GEMINI_MINIMAL_REJECTED_MODELS` dışındaki modellerde geçer.
- 429/5xx/ağ → tenacity üstel geri çekilme (4 deneme); diğer 4xx retry edilmez.
"""

from __future__ import annotations

import json
import time
from typing import Any

import httpx
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel
from tenacity import Retrying, retry_if_exception, stop_after_attempt, wait_exponential

from ..schemas import GEMINI_MINIMAL_REJECTED_MODELS
from .base import AdapterResult, AdapterUsage

RETRY_ATTEMPTS = 4
# Testler `wait_fixed(0)` ile değiştirir; gerçek koşuda üstel geri çekilme.
RETRY_WAIT = wait_exponential(multiplier=1, min=1, max=30)

_MISSING_KEY_MESSAGE = "GEMINI_API_KEY tanımlı değil — .env dosyasına ekleyin"


class GeminiError(ValueError):
    """Gemini adaptörünün kullanıcıya gösterilebilir hatası."""


def _resolve_schema(schema: dict[str, Any] | type[BaseModel] | None) -> Any:
    """JSON şema dict veya pydantic model sınıfı → SDK `response_schema` değeri."""
    if schema is None:
        return None
    if isinstance(schema, dict):
        return schema
    if isinstance(schema, type) and issubclass(schema, BaseModel):
        # SDK pydantic sınıfını doğrudan kabul eder ve şemaya çevirir.
        return schema
    raise GeminiError(
        "schema dict veya pydantic model sınıfı olmalı, "
        f"{type(schema).__name__} geldi"
    )


def _validate_thinking(model: str, thinking: str) -> str:
    level = str(thinking).strip().lower()
    if level == "minimal" and model in GEMINI_MINIMAL_REJECTED_MODELS:
        raise GeminiError(
            f"{model} thinking=minimal desteklemiyor — low/medium/high kullan"
        )
    return level


def _is_retryable(exc: BaseException) -> bool:
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code == 429 or code >= 500
    return isinstance(exc, (httpx.HTTPError, ConnectionError, TimeoutError))


def _token(usage: Any, field: str) -> int:
    value = getattr(usage, field, None)
    return int(value or 0)


def _usage_from(response: Any, duration_s: float) -> AdapterUsage:
    metadata = getattr(response, "usage_metadata", None)
    if metadata is None:
        return AdapterUsage(duration_s=duration_s)
    return AdapterUsage(
        input_tokens=_token(metadata, "prompt_token_count"),
        output_tokens=_token(metadata, "candidates_token_count"),
        thinking_tokens=_token(metadata, "thoughts_token_count"),
        duration_s=duration_s,
    )


def _parse_response(response: Any) -> Any:
    parsed = getattr(response, "parsed", None)
    if parsed is not None:
        if hasattr(parsed, "model_dump"):
            return parsed.model_dump(mode="json")
        return parsed
    text = getattr(response, "text", None)
    if not text:
        raise GeminiError("Gemini boş yanıt döndürdü")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise GeminiError(f"Gemini yanıtı geçerli JSON değil: {exc}") from exc


def generate(
    profile: Any,
    system: str,
    user: str,
    schema: dict[str, Any] | type[BaseModel] | None,
    thinking: str,
    max_tokens: int,
    api_key: str | None,
) -> AdapterResult:
    """Tek Gemini çağrısı; yapılandırılmış JSON ve kullanım bilgisi döndürür."""
    if not api_key:
        raise GeminiError(_MISSING_KEY_MESSAGE)

    model = profile.model
    level = _validate_thinking(model, thinking)
    response_schema = _resolve_schema(schema)

    config = genai_types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=response_schema,
        max_output_tokens=max_tokens,
        thinking_config=genai_types.ThinkingConfig(thinking_level=level),
    )

    client = genai.Client(api_key=api_key)

    def _call() -> Any:
        return client.models.generate_content(
            model=model,
            contents=user,
            config=config,
        )

    retryer = Retrying(
        stop=stop_after_attempt(RETRY_ATTEMPTS),
        wait=RETRY_WAIT,
        retry=retry_if_exception(_is_retryable),
        reraise=True,
    )
    started = time.perf_counter()
    for attempt in retryer:
        with attempt:
            response = _call()
    duration_s = time.perf_counter() - started

    data = _parse_response(response)
    return AdapterResult(data=data, usage=_usage_from(response, duration_s))
