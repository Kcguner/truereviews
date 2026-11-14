"""`rapor.providers.opencode` testleri: parse, retry, binary yokluğu, usage."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from rapor.config import ProviderProfile
from rapor.providers import opencode
from rapor.providers.base import AdapterResult
from rapor.providers.opencode import (
    MAX_ATTEMPTS,
    OpencodeError,
    OpencodeUnavailableError,
)


def _profile(**overrides) -> ProviderProfile:
    payload = {
        "name": "oc-test",
        "adapter": "opencode",
        "model": "provider/model",
    }
    payload.update(overrides)
    return ProviderProfile.model_validate(payload)


def _event(text: str) -> str:
    return json.dumps(
        {"type": "text", "part": {"type": "text", "text": text}}
    )


def _path_with(directory: Path) -> str:
    """Sahte binary klasörü + script'in `cat`/`echo` için gereken sistem yolları."""
    return f"{directory}:/usr/bin:/bin"


def _make_script(
    tmp_path: Path,
    responses: list[str],
    exit_codes: list[int] | None = None,
) -> Path:
    """Sahte `opencode` script'i: her çağrıda sıradaki yanıtı basar."""
    codes = exit_codes or [0] * len(responses)
    counter = tmp_path / "calls.txt"
    lines = [
        "#!/bin/sh",
        f'COUNTER="{counter}"',
        'n=$(cat "$COUNTER" 2>/dev/null || echo 0)',
        "n=$((n+1))",
        'echo "$n" > "$COUNTER"',
        'case "$n" in',
    ]
    for index, response in enumerate(responses, start=1):
        response_path = tmp_path / f"response-{index}.txt"
        response_path.write_text(response, encoding="utf-8")
        lines.append(f'  {index}) cat "{response_path}"; exit {codes[index - 1]} ;;')
    last = len(responses)
    fallback = tmp_path / f"response-{last}.txt"
    lines.append(f'  *) cat "{fallback}"; exit {codes[-1]} ;;')
    lines.append("esac")

    script = tmp_path / "opencode"
    script.write_text("\n".join(lines) + "\n", encoding="utf-8")
    script.chmod(0o755)
    return script


def _run(profile: ProviderProfile) -> AdapterResult:
    return opencode.generate(
        profile=profile,
        system="Yanıtı JSON ver.",
        user="Bir yorum yaz.",
        schema={"type": "object"},
        thinking="medium",
        max_tokens=1024,
        api_key=None,
    )


def test_missing_binary_raises(monkeypatch, tmp_path):
    empty = tmp_path / "empty-bin"
    empty.mkdir()
    monkeypatch.setenv("PATH", str(empty))

    with pytest.raises(OpencodeUnavailableError) as excinfo:
        _run(_profile())

    assert "opencode bulunamadı" in str(excinfo.value)
    assert "kapatıldı" in str(excinfo.value)


def test_valid_json_response_is_parsed(monkeypatch, tmp_path):
    _make_script(tmp_path, [_event(json.dumps({"score": 82, "tag": "iyi"}))])
    monkeypatch.setenv("PATH", _path_with(tmp_path))

    result = _run(_profile())

    assert result.data == {"score": 82, "tag": "iyi"}
    assert result.usage.input_tokens == 0
    assert result.usage.output_tokens == 0
    assert result.usage.thinking_tokens == 0
    assert result.usage.duration_s >= 0.0


def test_json_fence_is_tolerated(monkeypatch, tmp_path):
    fenced = "İşte sonuç:\n```json\n" + json.dumps({"themes": [], "n": 1}) + "\n```\nBitti."
    _make_script(tmp_path, [_event(fenced)])
    monkeypatch.setenv("PATH", _path_with(tmp_path))

    result = _run(_profile())

    assert result.data == {"themes": [], "n": 1}


def test_retry_after_unparseable_text(monkeypatch, tmp_path):
    _make_script(
        tmp_path,
        ["Bu bir JSON değil, sadece düz metin.", _event(json.dumps({"ok": True}))],
    )
    monkeypatch.setenv("PATH", _path_with(tmp_path))

    result = _run(_profile())

    assert result.data == {"ok": True}
    assert (tmp_path / "calls.txt").read_text().strip() == "2"


def test_retry_after_nonzero_exit(monkeypatch, tmp_path):
    _make_script(
        tmp_path,
        ["", _event(json.dumps({"ok": "ikinci"}))],
        exit_codes=[1, 0],
    )
    monkeypatch.setenv("PATH", _path_with(tmp_path))

    result = _run(_profile())

    assert result.data == {"ok": "ikinci"}
    assert (tmp_path / "calls.txt").read_text().strip() == "2"


def test_all_attempts_unparseable_raise(monkeypatch, tmp_path):
    _make_script(tmp_path, ["bozuk metin"] * MAX_ATTEMPTS)
    monkeypatch.setenv("PATH", _path_with(tmp_path))

    with pytest.raises(OpencodeError) as excinfo:
        _run(_profile())

    assert f"{MAX_ATTEMPTS} denemede" in str(excinfo.value)
    assert (tmp_path / "calls.txt").read_text().strip() == str(MAX_ATTEMPTS)


def test_usage_read_from_cli_output(monkeypatch, tmp_path):
    usage_event = json.dumps(
        {
            "type": "step_finish",
            "part": {"tokens": {"input": 120, "output": 34, "reasoning": 7}},
        }
    )
    stdout = "\n".join([_event(json.dumps({"ok": True})), usage_event])
    _make_script(tmp_path, [stdout])
    monkeypatch.setenv("PATH", _path_with(tmp_path))

    result = _run(_profile())

    assert result.data == {"ok": True}
    assert result.usage.input_tokens == 120
    assert result.usage.output_tokens == 34
    assert result.usage.thinking_tokens == 7
