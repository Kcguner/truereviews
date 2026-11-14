"""`rapor.pdf.theme` testleri — plan §6 palet, tipografi, ölçüler."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reportlab.pdfbase import pdfmetrics  # noqa: E402

from rapor.pdf import theme  # noqa: E402

EXPECTED_PALETTE = {
    "ink": "#14201E",
    "primary": "#1F4E4A",
    "primary_soft": "#E8F0ED",
    "complaint": "#B0432F",
    "complaint_soft": "#F7EAE6",
    "watch": "#7086A0",
    "line": "#D9DEDB",
    "paper": "#FCFCFA",
}

EXPECTED_FONTS = {
    "body": "DejaVuSans",
    "bold": "DejaVuSans-Bold",
    "italic": "DejaVuSerif-Italic",
}


def test_palette_matches_plan() -> None:
    assert theme.PALETTE == EXPECTED_PALETTE
    assert "orange" not in " ".join(theme.PALETTE.values()).lower()


def test_fonts_and_sizes() -> None:
    assert theme.FONTS == EXPECTED_FONTS
    assert theme.SIZES["page"] == "A4"
    assert theme.SIZES["margin"] == "18mm"
    assert theme.SIZES["h1"] == 20
    assert theme.SIZES["h2"] == 13
    assert theme.SIZES["body"] == 9.5
    assert theme.SIZES["small"] == 8
    assert theme.SIZES["tiny"] == 7
    assert theme.SIZES["quote"] == 9.5
    assert theme.SIZES["stat_value"] == 22
    assert theme.SIZES["stat_label"] == 7
    assert theme.SIZES["score_big"] == 30


def test_register_fonts_registers_three_fonts() -> None:
    theme.register_fonts()
    registered = pdfmetrics.getRegisteredFontNames()
    for name in EXPECTED_FONTS.values():
        assert name in registered


def test_register_fonts_is_idempotent() -> None:
    theme.register_fonts()
    before = sorted(pdfmetrics.getRegisteredFontNames())
    theme.register_fonts()
    after = sorted(pdfmetrics.getRegisteredFontNames())
    assert before == after


def test_register_fonts_accepts_explicit_dir() -> None:
    theme.register_fonts(ROOT / "fonts")
    registered = pdfmetrics.getRegisteredFontNames()
    for name in EXPECTED_FONTS.values():
        assert name in registered


def test_register_fonts_missing_dir_has_clear_error(tmp_path: Path) -> None:
    missing = tmp_path / "yok"
    with pytest.raises(FileNotFoundError) as exc:
        theme.register_fonts(missing)
    message = str(exc.value)
    assert "Font klasörü bulunamadı" in message
    assert str(missing) in message


def test_register_fonts_missing_file_has_clear_error(tmp_path: Path) -> None:
    (tmp_path / "DejaVuSans.ttf").write_bytes(b"not a font")
    with pytest.raises(FileNotFoundError) as exc:
        theme.register_fonts(tmp_path)
    message = str(exc.value)
    assert "Font dosyası bulunamadı" in message
    assert "DejaVuSans-Bold.ttf" in message


def test_styles_have_all_fields() -> None:
    theme.register_fonts()
    result = theme.styles()
    assert set(result) == {
        "body",
        "h1",
        "h2",
        "small",
        "tiny",
        "quote",
        "stat_label",
        "score_big",
    }

    assert result["body"].fontName == theme.FONTS["body"]
    assert result["body"].fontSize == theme.SIZES["body"]
    assert result["body"].textColor.hexval().lstrip("0x").upper() == "14201E"

    assert result["h1"].fontName == theme.FONTS["bold"]
    assert result["h1"].fontSize == theme.SIZES["h1"]

    assert result["h2"].fontName == theme.FONTS["bold"]
    assert result["h2"].fontSize == theme.SIZES["h2"]

    assert result["small"].fontSize == theme.SIZES["small"]
    assert result["tiny"].fontSize == theme.SIZES["tiny"]
    assert result["quote"].fontName == theme.FONTS["italic"]
    assert result["quote"].fontSize == theme.SIZES["quote"]

    assert result["stat_label"].fontName == theme.FONTS["bold"]
    assert result["stat_label"].fontSize == theme.SIZES["stat_label"]

    assert result["score_big"].fontSize == theme.SIZES["score_big"]
    assert result["score_big"].textColor.hexval().lstrip("0x").upper() == "1F4E4A"
