"""CLI komut testleri (plan §8, §9).

Ağ yok: config ``mock`` profiliyle çalışır. ``rapor.pdf.report`` paralel ajan
tarafından yazılmadıysa bu dosya geçici bir ``build_pdf`` stub'ı enjekte eder;
gerçek PDF entegrasyonu ayrı test konusudur (``REPORT_STUBPED`` bayrağı).
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import types
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"

REPORT_STUBBED = False


# --- PDF modülü: gerçek varsa kullan, yoksa stub enjekte et -----------------
try:  # pragma: no cover - gerçek modül varsa bu dal
    import rapor.pdf.report as _report_module  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover - paralel ajan henüz yazmadı
    REPORT_STUBBED = True
    _report_module = types.ModuleType("rapor.pdf.report")

    class _PDFBuildResult:
        def __init__(self, path: Path, page_count: int, trimmed: list[str], sections: list[str]):
            self.path = path
            self.page_count = page_count
            self.trimmed = trimmed
            self.sections = sections

    def _stub_build_pdf(
        out_dir: Any,
        place: Any,
        metrics: Any,
        insights: Any,
        aggregated: Any,
        write_result: Any,
        validation: Any,
        config: Any,
        *,
        lang: str = "tr",
        demo: bool = False,
        report_date: Any = None,
    ) -> _PDFBuildResult:
        del place, metrics, insights, aggregated, write_result, validation
        del config, lang, demo, report_date
        directory = Path(out_dir)
        target = directory / "rapor.pdf"
        target.write_bytes(b"%PDF-1.4\n% cli-test stub\n")
        return _PDFBuildResult(
            path=target,
            page_count=2,
            trimmed=[],
            sections=["ozet", "konular"],
        )

    _report_module.build_pdf = _stub_build_pdf
    _report_module.PDFBuildResult = _PDFBuildResult
    sys.modules["rapor.pdf.report"] = _report_module
    setattr(sys.modules["rapor.pdf"], "report", _report_module)

from rapor.cli import app  # noqa: E402

runner = CliRunner()


def _text(result: Any) -> str:
    return f"{result.stdout}\n{result.stderr}"


def _write_config(tmp_path: Path) -> tuple[Path, Path]:
    """Örnek config'i tmp dizine kopyalar, steps profillerini ``mock`` yapar."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    shutil.copy(ROOT / "providers.example.yaml", config_dir / "providers.yaml")
    config_text = (ROOT / "config.example.yaml").read_text(encoding="utf-8")
    config_text = config_text.replace(
        "profile: gemini-flash", "profile: mock"
    ).replace("profile: gemini-write", "profile: mock")
    (config_dir / "config.yaml").write_text(config_text, encoding="utf-8")

    providers_path = config_dir / "providers.yaml"
    providers_path.write_text(
        providers_path.read_text(encoding="utf-8")
        + """
  mock-b:
    adapter: mock
    model: mock-2
    max_tokens: 4096
    concurrency: 4
""",
        encoding="utf-8",
    )
    return config_dir, tmp_path / "work"


def _invoke(*args: str):
    return runner.invoke(app, list(args))


# ---------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------


def test_run_creates_all_outputs(tmp_path: Path) -> None:
    config_dir, work = _write_config(tmp_path)
    result = _invoke(
        "run", str(FIXTURES / "az.json"),
        "--config-dir", str(config_dir), "--out", str(work),
    )
    assert result.exit_code == 0, _text(result)
    assert "PDF:" in result.output

    out_dir = work / "out" / "kucuk-fincan"
    for name in ("rapor.pdf", "report.json", "metrics.json", "review.md", "usage.json"):
        assert (out_dir / name).is_file(), name

    report = json.loads((out_dir / "report.json").read_text(encoding="utf-8"))
    assert report["meta"]["profiles"] == {"tag": "mock", "write": "mock"}
    assert report["meta"]["lang"] == "tr"
    assert report["place"]["title"] == "Küçük Fincan"
    assert report["metrics"]["total_reviews"] == 8
    assert report["metrics"]["score"] is not None
    assert report["verdict"]
    assert "ratio" in report["validation"]
    assert isinstance(report["warnings"], list)
    assert isinstance(report["themes_praise"], list)
    assert all("strength" in theme and "review_count" in theme
               for theme in report["themes_praise"])

    metrics = json.loads((out_dir / "metrics.json").read_text(encoding="utf-8"))
    assert metrics["total_reviews"] == report["metrics"]["total_reviews"]

    review_md = (out_dir / "review.md").read_text(encoding="utf-8")
    assert "Skor" in review_md
    assert "Doğrulama oranı" in review_md

    usage = json.loads((out_dir / "usage.json").read_text(encoding="utf-8"))
    assert usage["totals"]["calls"] >= 1


def test_run_second_time_uses_state_no_extra_tag_call(tmp_path: Path) -> None:
    config_dir, work = _write_config(tmp_path)
    args = (
        "run", str(FIXTURES / "az.json"),
        "--config-dir", str(config_dir), "--out", str(work),
    )
    first = _invoke(*args)
    assert first.exit_code == 0, _text(first)

    out_dir = work / "out" / "kucuk-fincan"
    usage_path = out_dir / "usage.json"
    before = json.loads(usage_path.read_text(encoding="utf-8"))["calls"]
    tag_before = sum(1 for call in before if call.get("step") == "tag")

    second = _invoke(*args)
    assert second.exit_code == 0, _text(second)
    after = json.loads(usage_path.read_text(encoding="utf-8"))["calls"]
    tag_after = sum(1 for call in after if call.get("step") == "tag")
    assert tag_after == tag_before, "state varken tag tekrar koşmamalı"
    assert (out_dir / "rapor.pdf").is_file()
    assert (out_dir / "state.json").is_file()


def test_run_lang_en_keeps_tags_and_single_step(tmp_path: Path) -> None:
    """EN tag promptundaki "write" sözcüğü mock'u write moduna sokmamalı.

    Kusur: EN koşuda tag grubu düşüyor, uyarı çıkıyor, `single_step` küme
    dışı "30" sayısı yüzünden gizleniyordu. İkisi de artık olmamalı.
    """
    config_dir, work = _write_config(tmp_path)
    result = _invoke(
        "run", str(FIXTURES / "az.json"), "--lang", "en",
        "--config-dir", str(config_dir), "--out", str(work),
    )
    assert result.exit_code == 0, _text(result)

    out_dir = work / "out" / "kucuk-fincan"
    report = json.loads((out_dir / "report.json").read_text(encoding="utf-8"))
    assert report["meta"]["lang"] == "en"
    assert not any("etiketlenemedi" in warning for warning in report["warnings"])
    assert "single_step" not in report["validation"]["hidden_blocks"]
    assert report["single_step"] is not None
    assert report["single_step"]["action"]


# ---------------------------------------------------------------------------
# batch
# ---------------------------------------------------------------------------


def test_batch_writes_summary_and_skips_completed(tmp_path: Path) -> None:
    config_dir, work = _write_config(tmp_path)
    folder = tmp_path / "batch-in"
    folder.mkdir()
    shutil.copy(FIXTURES / "az.json", folder / "az.json")
    shutil.copy(FIXTURES / "yanitsiz.json", folder / "yanitsiz.json")

    args = (
        "batch", str(folder),
        "--config-dir", str(config_dir), "--out", str(work),
    )
    first = _invoke(*args)
    assert first.exit_code == 0, _text(first)

    summary = work / "out" / "batch_summary.csv"
    assert summary.is_file()
    rows = summary.read_text(encoding="utf-8").strip().splitlines()
    assert len(rows) == 3  # başlık + 2 mekan
    assert rows[0].startswith("mekan,skor,durum")

    second = _invoke(*args)
    assert second.exit_code == 0, _text(second)
    assert "atlandı" in second.output
    rows_again = summary.read_text(encoding="utf-8").strip().splitlines()
    assert len(rows_again) == 3


# ---------------------------------------------------------------------------
# compare / thinking-test
# ---------------------------------------------------------------------------


def test_compare_two_profiles_tag_runs_once(tmp_path: Path) -> None:
    config_dir, work = _write_config(tmp_path)
    result = _invoke(
        "compare", str(FIXTURES / "az.json"),
        "--profiles", "mock,mock-b",
        "--config-dir", str(config_dir), "--out", str(work),
    )
    assert result.exit_code == 0, _text(result)
    assert "mock" in result.output and "mock-b" in result.output
    assert "tek adım" in result.output

    tag_usage = work / "out" / "compare" / "kucuk-fincan-tag" / "usage.json"
    calls = json.loads(tag_usage.read_text(encoding="utf-8"))["calls"]
    assert sum(1 for call in calls if call.get("step") == "tag") == 1

    for profile in ("mock", "mock-b"):
        out_dir = work / "out" / "compare" / f"kucuk-fincan-{profile}"
        assert (out_dir / "report.json").is_file()
        assert (out_dir / "rapor.pdf").is_file()
        report = json.loads((out_dir / "report.json").read_text(encoding="utf-8"))
        assert report["meta"]["profiles"]["write"] == profile


def test_thinking_test_two_levels(tmp_path: Path) -> None:
    config_dir, work = _write_config(tmp_path)
    result = _invoke(
        "thinking-test", str(FIXTURES / "az.json"),
        "--profile", "mock", "--levels", "low,medium",
        "--config-dir", str(config_dir), "--out", str(work),
    )
    assert result.exit_code == 0, _text(result)
    lines = [line for line in result.output.splitlines() if line.startswith(("low", "medium"))]
    assert len(lines) >= 2

    for level in ("low", "medium"):
        out_dir = work / "out" / "thinking" / f"kucuk-fincan-{level}"
        assert (out_dir / "report.json").is_file()


# ---------------------------------------------------------------------------
# review / approve / track
# ---------------------------------------------------------------------------


def test_review_lists_score_after_run(tmp_path: Path) -> None:
    config_dir, work = _write_config(tmp_path)
    assert _invoke(
        "run", str(FIXTURES / "az.json"),
        "--config-dir", str(config_dir), "--out", str(work),
    ).exit_code == 0

    result = _invoke("review", str(work))
    assert result.exit_code == 0, _text(result)
    assert "kucuk-fincan" in result.output
    assert "skor" in result.output
    score = json.loads(
        (work / "out" / "kucuk-fincan" / "report.json").read_text(encoding="utf-8")
    )["metrics"]["score"]
    assert f"{score:g}" in result.output


def test_approve_copies_and_tracks(tmp_path: Path) -> None:
    config_dir, work = _write_config(tmp_path)
    assert _invoke(
        "run", str(FIXTURES / "az.json"),
        "--config-dir", str(config_dir), "--out", str(work),
    ).exit_code == 0

    result = _invoke("approve", "kucuk-fincan", "--out", str(work))
    assert result.exit_code == 0, _text(result)

    assert (work / "out" / "ready" / "kucuk-fincan.pdf").is_file()
    assert (work / "out" / "kucuk-fincan" / "rapor.pdf").is_file(), "kopya, taşıma değil"

    tracking = (work / "out" / "tracking.csv").read_text(encoding="utf-8")
    assert "kucuk-fincan" in tracking
    assert "hazır" in tracking


def test_track_prints_table(tmp_path: Path) -> None:
    config_dir, work = _write_config(tmp_path)
    assert _invoke(
        "run", str(FIXTURES / "az.json"),
        "--config-dir", str(config_dir), "--out", str(work),
    ).exit_code == 0
    assert _invoke("approve", "kucuk-fincan", "--out", str(work)).exit_code == 0

    result = _invoke("track", "--out", str(work))
    assert result.exit_code == 0, _text(result)
    assert "Küçük Fincan" in result.output
    assert "hazır" in result.output
    assert "gönderim tarihi" in result.output


# ---------------------------------------------------------------------------
# Hatalar
# ---------------------------------------------------------------------------


def test_broken_json_is_reported_and_nonzero_exit(tmp_path: Path) -> None:
    config_dir, work = _write_config(tmp_path)
    broken = tmp_path / "broken.json"
    broken.write_text("{bu bir json değil", encoding="utf-8")

    result = _invoke(
        "run", str(broken), "--config-dir", str(config_dir), "--out", str(work)
    )
    assert result.exit_code != 0
    assert "JSON okunamadı" in _text(result)


def test_missing_api_key_message(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    config_dir, work = _write_config(tmp_path)

    result = _invoke(
        "run", str(FIXTURES / "az.json"),
        "--config-dir", str(config_dir),
        "--tag-profile", "mock",
        "--write-profile", "gemini-flash",
        "--out", str(work),
    )
    assert result.exit_code != 0
    assert "GEMINI_API_KEY tanımlı değil" in _text(result)
    assert ".env" in _text(result)


def test_missing_config_reports_field(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    result = _invoke(
        "run", str(FIXTURES / "az.json"),
        "--config-dir", str(empty), "--out", str(tmp_path),
    )
    assert result.exit_code != 0
    assert "providers.yaml bulunamadı" in _text(result)
