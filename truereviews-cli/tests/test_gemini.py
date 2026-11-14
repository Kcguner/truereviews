"""Gemini adaptörü testleri — SDK client sahtelenir, ağ yok (plan §9)."""

from __future__ import annotations

import json
import sys
import types
from typing import Any

import pytest
from google.genai import errors as genai_errors
from tenacity import wait_fixed

from rapor.config import ProviderProfile
from rapor.schemas import WriteResult

# base.py paralel ajan tarafından yazılıyor; henüz yoksa testler için
# sözleşmedeki iki modeli geçici olarak sağla (gerçek dosya varsa kullanılır).
try:  # pragma: no cover - ortam durumuna bağlı
    import rapor.providers.base  # noqa: F401
except ImportError:  # pragma: no cover
    from pydantic import BaseModel, Field

    _stub = types.ModuleType("rapor.providers.base")

    class AdapterUsage(BaseModel):
        input_tokens: int = 0
        output_tokens: int = 0
        thinking_tokens: int = 0
        duration_s: float = 0.0

    class AdapterResult(BaseModel):
        data: Any = None
        usage: AdapterUsage = Field(default_factory=AdapterUsage)

    _stub.AdapterUsage = AdapterUsage
    _stub.AdapterResult = AdapterResult
    sys.modules["rapor.providers.base"] = _stub

from rapor.providers import gemini  # noqa: E402


class FakeUsageMetadata:
    def __init__(
        self,
        prompt: int | None = 11,
        candidates: int | None = 7,
        thoughts: int | None = 3,
    ) -> None:
        self.prompt_token_count = prompt
        self.candidates_token_count = candidates
        self.thoughts_token_count = thoughts


class FakeResponse:
    def __init__(self, text: str, usage: Any = None) -> None:
        self.text = text
        self.usage_metadata = usage if usage is not None else FakeUsageMetadata()
        self.parsed = None


class FakeModels:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    def generate_content(self, *, model: str, contents: Any, config: Any) -> Any:
        self.calls.append({"model": model, "contents": contents, "config": config})
        result = self.responses.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result


class FakeClient:
    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key
        self.models = FakeClient.models_instance


def install_client(monkeypatch: pytest.MonkeyPatch, *responses: Any) -> FakeModels:
    models = FakeModels(list(responses))
    FakeClient.models_instance = models

    def _factory(api_key: str | None = None) -> FakeClient:
        return FakeClient(api_key=api_key)

    monkeypatch.setattr(gemini.genai, "Client", _factory)
    return models


def make_profile(model: str = "gemini-3.8-flash", thinking: str = "low") -> ProviderProfile:
    return ProviderProfile(
        name="gemini-test",
        adapter="gemini",
        model=model,
        api_key_env="GEMINI_API_KEY",
        thinking=thinking,
        max_tokens=2048,
    )


def run(profile: ProviderProfile, schema=None, thinking: str = "low", api_key="test-key"):
    return gemini.generate(
        profile=profile,
        system="sistem",
        user="kullanıcı",
        schema=schema,
        thinking=thinking,
        max_tokens=1234,
        api_key=api_key,
    )


SCHEMA = {
    "type": "object",
    "properties": {"answer": {"type": "string"}},
    "required": ["answer"],
}


def test_config_fields_passed(monkeypatch: pytest.MonkeyPatch) -> None:
    models = install_client(monkeypatch, FakeResponse(json.dumps({"answer": "ok"})))

    result = run(make_profile(), schema=SCHEMA, thinking="high")

    config = models.calls[0]["config"]
    assert config.response_schema == SCHEMA
    assert config.response_mime_type == "application/json"
    assert str(config.thinking_config.thinking_level).lower().endswith("high")
    assert config.max_output_tokens == 1234
    assert config.system_instruction == "sistem"
    assert models.calls[0]["contents"] == "kullanıcı"
    assert models.calls[0]["model"] == "gemini-3.8-flash"
    assert result.data == {"answer": "ok"}


def test_minimal_rejected_for_gemini_3_8_flash(monkeypatch: pytest.MonkeyPatch) -> None:
    models = install_client(monkeypatch, FakeResponse("{}"))

    with pytest.raises(gemini.GeminiError, match="thinking=minimal desteklemiyor"):
        run(make_profile(), thinking="minimal")

    assert models.calls == []


def test_minimal_allowed_for_other_model(monkeypatch: pytest.MonkeyPatch) -> None:
    models = install_client(monkeypatch, FakeResponse("{}"))

    run(make_profile(model="gemini-2.5-flash"), thinking="minimal")

    config = models.calls[0]["config"]
    assert "minimal" in str(config.thinking_config.thinking_level).lower()


def test_usage_metadata_mapping(monkeypatch: pytest.MonkeyPatch) -> None:
    usage = FakeUsageMetadata(prompt=100, candidates=40, thoughts=9)
    install_client(monkeypatch, FakeResponse("{}", usage=usage))

    result = run(make_profile())

    assert result.usage.input_tokens == 100
    assert result.usage.output_tokens == 40
    assert result.usage.thinking_tokens == 9
    assert result.usage.duration_s >= 0.0


def test_retries_on_429_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gemini, "RETRY_WAIT", wait_fixed(0))
    models = install_client(
        monkeypatch,
        genai_errors.APIError(429, {"error": {"code": 429, "message": "rate"}}),
        FakeResponse(json.dumps({"answer": "ikinci"})),
    )

    result = run(make_profile())

    assert len(models.calls) == 2
    assert result.data == {"answer": "ikinci"}


def test_4xx_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gemini, "RETRY_WAIT", wait_fixed(0))
    models = install_client(
        monkeypatch,
        genai_errors.APIError(400, {"error": {"code": 400, "message": "bad"}}),
    )

    with pytest.raises(genai_errors.APIError):
        run(make_profile())

    assert len(models.calls) == 1


def test_missing_api_key() -> None:
    with pytest.raises(gemini.GeminiError, match="GEMINI_API_KEY tanımlı değil"):
        run(make_profile(), api_key=None)


def test_schema_accepts_dict(monkeypatch: pytest.MonkeyPatch) -> None:
    models = install_client(monkeypatch, FakeResponse("{}"))

    run(make_profile(), schema=SCHEMA)

    assert models.calls[0]["config"].response_schema == SCHEMA


def test_schema_accepts_pydantic_model(monkeypatch: pytest.MonkeyPatch) -> None:
    models = install_client(monkeypatch, FakeResponse("{}"))

    run(make_profile(), schema=WriteResult)

    assert models.calls[0]["config"].response_schema is WriteResult


def test_no_schema_still_json_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    models = install_client(monkeypatch, FakeResponse("{}"))

    run(make_profile(), schema=None)

    config = models.calls[0]["config"]
    assert config.response_schema is None
    assert config.response_mime_type == "application/json"
