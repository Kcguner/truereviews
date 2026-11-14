"""PDF teması — palet, fontlar, ölçüler ve paragraf stilleri (plan §6).

Renk ve tipografi tek kaynaktan gelir. ``charts.py`` ve ``components.py``
yalnızca bu sabitleri kullanır; modül içinde başka renk üretilmez. Turuncu
yoktur.

Fontlar paket kökündeki ``fonts/`` klasöründen yüklenir:
``rapor/pdf/theme.py`` -> ``../../fonts``. ``register_fonts`` idempotenttir;
aynı süreçte ikinci çağrı fontları yeniden kaydetmez.

``styles()`` yeni font kaydetmez; çağıran önce ``register_fonts()`` çağırır.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Final

from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

__all__ = [
    "PALETTE",
    "FONTS",
    "SIZES",
    "FONT_FILES",
    "register_fonts",
    "default_fonts_dir",
    "styles",
]

# ---------------------------------------------------------------------------
# Sabitler
# ---------------------------------------------------------------------------

PALETTE: Final[dict[str, str]] = {
    "ink": "#14201E",            # mürekkep
    "primary": "#1F4E4A",        # ana koyu yeşil-teal
    "primary_soft": "#E8F0ED",   # ana yumuşak zemin
    "complaint": "#B0432F",      # sıcak kırmızı
    "complaint_soft": "#F7EAE6", # şikayet zemini
    "watch": "#7086A0",          # izlenmeli gri-mavi
    "line": "#D9DEDB",           # çizgi
    "paper": "#FCFCFA",          # kağıt
}

FONTS: Final[dict[str, str]] = {
    "body": "DejaVuSans",
    "bold": "DejaVuSans-Bold",
    "italic": "DejaVuSerif-Italic",
}

# Mantıksal rol -> paket içindeki dosya adı.
FONT_FILES: Final[dict[str, str]] = {
    "body": "DejaVuSans.ttf",
    "bold": "DejaVuSans-Bold.ttf",
    "italic": "DejaVuSerif-Italic.ttf",
}

SIZES: Final[dict[str, Any]] = {
    "page": "A4",
    "margin": "18mm",          # 4 kenar
    "h1": 20, "h2": 13, "body": 9.5, "small": 8, "tiny": 7, "quote": 9.5,
    "stat_value": 22, "stat_label": 7, "score_big": 30,
}


# ---------------------------------------------------------------------------
# Fontlar
# ---------------------------------------------------------------------------


def default_fonts_dir() -> Path:
    """Paket kökündeki ``fonts/`` klasörü (``rapor/pdf/theme.py`` -> ../../fonts)."""
    return Path(__file__).resolve().parents[2] / "fonts"


def register_fonts(fonts_dir: str | Path | None = None) -> None:
    """DejaVu fontlarını reportlab'a kaydeder (idempotent).

    Args:
        fonts_dir: Font dosyalarının klasörü. ``None`` -> paket ``fonts/``.

    Raises:
        FileNotFoundError: Klasör ya da beklenen font dosyaları yoksa.
    """
    directory = Path(fonts_dir) if fonts_dir is not None else default_fonts_dir()
    if not directory.is_dir():
        raise FileNotFoundError(
            f"Font klasörü bulunamadı: {directory}. "
            "DejaVu fontlarını fonts/ altına koyun veya fonts_dir verin."
        )

    registered = set(pdfmetrics.getRegisteredFontNames())
    missing: list[Path] = []
    paths: dict[str, Path] = {}

    for role, filename in FONT_FILES.items():
        path = directory / filename
        paths[role] = path
        if not path.is_file():
            missing.append(path)

    if missing:
        listed = ", ".join(str(path) for path in missing)
        raise FileNotFoundError(
            f"Font dosyası bulunamadı: {listed}. "
            "fonts/ altında DejaVuSans.ttf, DejaVuSans-Bold.ttf ve "
            "DejaVuSerif-Italic.ttf bulunmalı."
        )

    for role, path in paths.items():
        name = FONTS[role]
        if name in registered:
            continue
        pdfmetrics.registerFont(TTFont(name, str(path)))
        registered.add(name)


# ---------------------------------------------------------------------------
# Stiller
# ---------------------------------------------------------------------------


def _color(name: str) -> HexColor:
    """Palet anahtarı -> reportlab rengi (stil nesneleri Color ister)."""
    return HexColor(PALETTE[name])


def styles() -> dict[str, ParagraphStyle]:
    """Rapor paragraf stilleri. Fontlar ``FONTS``, renkler ``PALETTE``'ten.

    Dönen anahtarlar: ``body``, ``h1``, ``h2``, ``small``, ``tiny``, ``quote``,
    ``stat_label``, ``score_big``.
    """
    body_size = float(SIZES["body"])
    return {
        "body": ParagraphStyle(
            "Body",
            fontName=FONTS["body"],
            fontSize=body_size,
            leading=body_size * 1.45,
            textColor=_color("ink"),
        ),
        "h1": ParagraphStyle(
            "H1",
            fontName=FONTS["bold"],
            fontSize=float(SIZES["h1"]),
            leading=float(SIZES["h1"]) * 1.2,
            textColor=_color("ink"),
            spaceAfter=2,
        ),
        "h2": ParagraphStyle(
            "H2",
            fontName=FONTS["bold"],
            fontSize=float(SIZES["h2"]),
            leading=float(SIZES["h2"]) * 1.25,
            textColor=_color("primary"),
            spaceBefore=6,
            spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "Small",
            fontName=FONTS["body"],
            fontSize=float(SIZES["small"]),
            leading=float(SIZES["small"]) * 1.35,
            textColor=_color("watch"),
        ),
        "tiny": ParagraphStyle(
            "Tiny",
            fontName=FONTS["body"],
            fontSize=float(SIZES["tiny"]),
            leading=float(SIZES["tiny"]) * 1.35,
            textColor=_color("watch"),
        ),
        "quote": ParagraphStyle(
            "Quote",
            fontName=FONTS["italic"],
            fontSize=float(SIZES["quote"]),
            leading=float(SIZES["quote"]) * 1.45,
            textColor=_color("ink"),
            leftIndent=6,
            rightIndent=6,
        ),
        "stat_label": ParagraphStyle(
            "StatLabel",
            fontName=FONTS["bold"],
            fontSize=float(SIZES["stat_label"]),
            leading=float(SIZES["stat_label"]) * 1.3,
            textColor=_color("watch"),
        ),
        "score_big": ParagraphStyle(
            "ScoreBig",
            fontName=FONTS["bold"],
            fontSize=float(SIZES["score_big"]),
            leading=float(SIZES["score_big"]) * 1.1,
            textColor=_color("primary"),
        ),
    }
