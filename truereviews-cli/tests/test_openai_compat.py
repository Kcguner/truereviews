"""openai_compat adaptörü — HTTP seviyesinde mock (plan §3, §9).

Not: openai SDK 3.x `httpx2` kullanır; `respx` yalnızca `httpx` paketini
yama yapar, bu yüzden trafiği yakalayamaz. Burada aynı gerçekçilik korunur:
gerçek `OpenAI` istemcisi + gerçek serileştirme/parse yolu çalışır, yalnızca
taşıma katmanı `httpx2.MockTransport` ile kesilir. İstemci adaptörün
`_build_client` dikişi üzerinden verilir (SDK factory'si taklit edilmez).
"""

from __future__ import annotations

import json
from typing import Any, Callable, Iterable

import httpx2
import pytest
from tenacity import wait_none

base = pytest.importorskip(
    "rapor.providers.base",
    reason="paralel ajan rapor/providers/base.py dosyasını yazıyor",
)

from openai import OpenAI  # noqa: E402

from rapor.config import ProviderProfile  # noqa: E402
from rapor.providers import openai_compat  # noqa: E402
from rapor.providers.openai_compat import (  # noqa: E402
    AdapterError,
    AdapterResult,
    AdapterUsage,
    generate,
)

BASE_URL = "https://api.test/v1"
COMPLETIONS_PATH = "/v1/chat/completions"
SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"verdict": {"type": "string"}},
    "required": ["verdict"],
}


class MockServer:
    """Sıralı yanıt/istisna listesi; her isteği kaydeder."""

    def __init__(self, replies: Iterable[Any]) -> None:
        self.replies = list(replies)
        self.requests: list[httpx2.Request] = []
        self.bodies: list[dict[str, Any]] = []

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        self.bodies.append(json.loads(request.content))
        if not self.replies:
            raise AssertionError(f"beklenmeyen fazladan istek: {request.url}")
        reply = self.replies.pop(0)
        if callable(reply):
            return reply(request)
        if isinstance(reply, Exception):
            raise reply
        return reply

    @property
    def call_count(self) -> int:
        return len(self.requests)


@pytest.fixture(autouse=True)
def _fast_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    """Retry beklemelerini sıfırla: testler hızlı koşsun."""
    monkeypatch.setattr(openai_compat, "RETRY_WAIT", wait_none())


@pytest.fixture
def server_factory(monkeypatch: pytest.MonkeyPatch) -> Callable[..., MockServer]:
    """Adaptörün HTTP istemcisini MockTransport'lu gerçek SDK istemcisiyle değiştir."""

    def factory(replies: Iterable[Any]) -> MockServer:
        server = MockServer(replies)

        def _build_client(profile: ProviderProfile, api_key: str) -> OpenAI:
            return OpenAI(
                base_url=profile.base_url,
                api_key=api_key,
                max_retries=0,
                http_client=httpx2.Client(
                    transport=httpx2.MockTransport(server.handler)
                ),
            )

        monkeypatch.setattr(openai_compat, "_build_client", _build_client)
        return server

    return factory


def make_profile(**overrides: Any) -> ProviderProfile:
    payload: dict[str, Any] = {
        "name": "glm-test",
        "adapter": "openai_compat",
        "model": "glm-5.3-flash",
        "base_url": BASE_URL,
        "api_key_env": "GLM_API_KEY",
        "thinking": "medium",
        "max_tokens": 512,
    }
    payload.update(overrides)
    return ProviderProfile.model_validate(payload)


def completion_body(
    content: str,
    *,
    prompt_tokens: int = 100,
    completion_tokens: int = 20,
    reasoning_tokens: int | None = None,
) -> dict[str, Any]:
    usage: dict[str, Any] = {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
    }
    if reasoning_tokens is not None:
        usage["completion_tokens_details"] = {"reasoning_tokens": reasoning_tokens}
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 0,
        "model": "glm-5.3-flash",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": usage,
    }


def ok(content: str, **kwargs: Any) -> httpx2.Response:
    return httpx2.Response(200, json=completion_body(content, **kwargs))


def error(status: int, message: str, code: str) -> httpx2.Response:
    return httpx2.Response(
        status,
        json={"error": {"message": message, "type": code, "code": code}},
    )


def run_generate(profile: ProviderProfile | None = None, **kwargs: Any) -> AdapterResult:
    profile = profile or make_profile()
    params: dict[str, Any] = {
        "schema": SCHEMA,
        "thinking": "medium",
        "max_tokens": 512,
        "api_key": "sk-test",
    }
    params.update(kwargs)
    return generate(profile, "system prompt", "user prompt", **params)


# --- retry davranışı -------------------------------------------------------


def test_429_retried_then_success(server_factory: Callable[..., MockServer]) -> None:
    server = server_factory(
        [
            error(429, "rate limited", "rate_limit_error"),
            ok('{"verdict": "iyi"}'),
        ]
    )

    result = run_generate()

    assert isinstance(result, AdapterResult)
    assert result.data == {"verdict": "iyi"}
    assert server.call_count == 2


def test_500_retried_then_success(server_factory: Callable[..., MockServer]) -> None:
    server = server_factory(
        [
            error(503, "overloaded", "server_error"),
            ok('{"verdict": "orta"}'),
        ]
    )

    result = run_generate()

    assert result.data == {"verdict": "orta"}
    assert server.call_count == 2


def test_connection_error_retried(server_factory: Callable[..., MockServer]) -> None:
    server = server_factory(
        [
            httpx2.ConnectError("connection refused"),
            ok('{"verdict": "iyi"}'),
        ]
    )

    result = run_generate()

    assert result.data == {"verdict": "iyi"}
    assert server.call_count == 2


@pytest.mark.parametrize("status", [400, 401])
def test_client_error_not_retried(
    server_factory: Callable[..., MockServer], status: int
) -> None:
    server = server_factory([error(status, "bad request", "invalid_request_error")])

    with pytest.raises(AdapterError) as excinfo:
        run_generate()

    assert str(status) in str(excinfo.value)
    assert server.call_count == 1


def test_json_parse_error_retried(server_factory: Callable[..., MockServer]) -> None:
    server = server_factory(
        [
            ok("bu JSON değil {{"),
            ok('{"verdict": "çok iyi"}'),
        ]
    )

    result = run_generate()

    assert result.data == {"verdict": "çok iyi"}
    assert server.call_count == 2


def test_retries_exhausted_raise_clear_error(
    server_factory: Callable[..., MockServer],
) -> None:
    server = server_factory(
        [error(429, "rate limited", "rate_limit_error")] * openai_compat.ATTEMPTS
    )

    with pytest.raises(AdapterError) as excinfo:
        run_generate()

    assert "429" in str(excinfo.value)
    assert server.call_count == openai_compat.ATTEMPTS


# --- response_format fallback ---------------------------------------------


def test_response_format_fallback_on_400(
    server_factory: Callable[..., MockServer],
) -> None:
    def reject_json_mode(request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        if "response_format" in body:
            return error(
                400,
                "response_format type json_object is not supported by this model",
                "invalid_request_error",
            )
        return ok('{"verdict": "iyi"}')

    server = server_factory([reject_json_mode, reject_json_mode])

    result = run_generate()

    assert result.data == {"verdict": "iyi"}
    assert server.call_count == 2
    assert "response_format" in server.bodies[0]
    assert "response_format" not in server.bodies[1]


def test_no_fallback_when_schema_missing(
    server_factory: Callable[..., MockServer],
) -> None:
    server = server_factory([ok('{"verdict": "iyi"}')])

    run_generate(schema=None)

    assert server.call_count == 1
    assert "response_format" not in server.bodies[0]


# --- istek gövdesi ---------------------------------------------------------


def test_extra_body_passed_through(server_factory: Callable[..., MockServer]) -> None:
    server = server_factory([ok('{"verdict": "iyi"}')])
    profile = make_profile(extra_body={"thinking": {"type": "enabled"}, "top_k": 3})

    run_generate(profile)

    body = server.bodies[0]
    assert body["thinking"] == {"type": "enabled"}
    assert body["top_k"] == 3
    assert body["model"] == "glm-5.3-flash"
    assert body["max_tokens"] == 512
    assert body["messages"] == [
        {"role": "system", "content": "system prompt"},
        {"role": "user", "content": "user prompt"},
    ]
    request = server.requests[0]
    assert request.url.path == COMPLETIONS_PATH
    assert request.headers["authorization"] == "Bearer sk-test"


def test_default_json_object_response_format_sent(
    server_factory: Callable[..., MockServer],
) -> None:
    server = server_factory([ok('{"verdict": "iyi"}')])

    run_generate()

    assert server.bodies[0]["response_format"] == {"type": "json_object"}


# --- usage -----------------------------------------------------------------


def test_usage_mapped_without_reasoning_tokens(
    server_factory: Callable[..., MockServer],
) -> None:
    server_factory([ok('{"verdict": "iyi"}', prompt_tokens=321, completion_tokens=45)])

    result = run_generate()

    assert isinstance(result.usage, AdapterUsage)
    assert result.usage.input_tokens == 321
    assert result.usage.output_tokens == 45
    assert result.usage.thinking_tokens == 0
    assert result.usage.duration_s >= 0.0


def test_usage_mapped_with_reasoning_tokens(
    server_factory: Callable[..., MockServer],
) -> None:
    server_factory(
        [
            ok(
                '{"verdict": "iyi"}',
                prompt_tokens=100,
                completion_tokens=60,
                reasoning_tokens=25,
            )
        ]
    )

    result = run_generate()

    assert result.usage.input_tokens == 100
    assert result.usage.output_tokens == 60
    assert result.usage.thinking_tokens == 25


# --- yapılandırma hataları -------------------------------------------------


@pytest.mark.parametrize("api_key", [None, ""])
def test_missing_api_key_clear_error(api_key: str | None) -> None:
    with pytest.raises(AdapterError) as excinfo:
        run_generate(api_key=api_key)

    assert str(excinfo.value) == "GLM_API_KEY tanımlı değil — .env dosyasına ekleyin"


def test_missing_base_url_clear_error() -> None:
    profile = make_profile(base_url="")

    with pytest.raises(AdapterError) as excinfo:
        run_generate(profile)

    assert "base_url" in str(excinfo.value)
