"""`out/` yapısı, slug üretimi ve koşu durumu (plan §3, §7, §8).

* `slugify(place_title)` — Türkçe karakterleri ASCII'ye indirir, dosya adı
  güvenli hale getirir (`Örnek Pasta & Cafe` → `ornek-pasta-cafe`).
* `out_dir_for(root, slug)` → `<root>/out/<slug>/`.
* `RunState` — `out/<slug>/state.json`. Tag grupları grup bazında saklanır;
  `run`/`batch` yeniden çalışınca yalnızca `missing_groups()` koşulur.
* Takip CSV'si: `out/tracking.csv` başlığı
  `slug, mekan, gönderim_tarihi, kanal, yanit_durumu`.
"""

from __future__ import annotations

import csv
import json
import os
import re
import tempfile
import unicodedata
from pathlib import Path
from typing import Any, Iterable, Mapping

__all__ = [
    "BATCH_SUMMARY_CSV",
    "OUT_DIRNAME",
    "READY_DIRNAME",
    "RunState",
    "STATE_FILENAME",
    "TRACKING_CSV",
    "TRACKING_HEADER",
    "append_tracking_csv",
    "batch_summary_path",
    "out_dir_for",
    "ready_dir",
    "slugify",
    "tracking_csv_path",
]

OUT_DIRNAME = "out"
READY_DIRNAME = "ready"
STATE_FILENAME = "state.json"
TRACKING_CSV = "tracking.csv"
BATCH_SUMMARY_CSV = "batch_summary.csv"
TRACKING_HEADER: tuple[str, ...] = (
    "slug",
    "mekan",
    "gönderim_tarihi",
    "kanal",
    "yanit_durumu",
)

_TR_MAP: dict[str, str] = {
    "ç": "c",
    "Ç": "c",
    "ğ": "g",
    "Ğ": "g",
    "ı": "i",
    "I": "i",
    "İ": "i",
    "ö": "o",
    "Ö": "o",
    "ş": "s",
    "Ş": "s",
    "ü": "u",
    "Ü": "u",
    "â": "a",
    "Â": "a",
    "î": "i",
    "Î": "i",
    "û": "u",
    "Û": "u",
    "&": " ve ",
}


def slugify(place_title: str) -> str:
    """Mekan adından dosya adı güvenli slug üretir.

    Türkçe harfler ASCII karşılığına iner (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u),
    `&` "ve" olur, kalan her şey tireye döner.
    """
    text = str(place_title or "")
    text = "".join(_TR_MAP.get(char, char) for char in text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.casefold()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    text = re.sub(r"-{2,}", "-", text)
    return text or "mekan"


def out_dir_for(root: str | Path, slug: str) -> Path:
    """`<root>/out/<slug>/` — dizinleri oluşturur."""
    directory = Path(root) / OUT_DIRNAME / slug
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def ready_dir(root: str | Path) -> Path:
    """`<root>/out/ready/` — dizinleri oluşturur."""
    directory = Path(root) / OUT_DIRNAME / READY_DIRNAME
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def tracking_csv_path(root: str | Path) -> Path:
    return Path(root) / OUT_DIRNAME / TRACKING_CSV


def batch_summary_path(root: str | Path) -> Path:
    return Path(root) / OUT_DIRNAME / BATCH_SUMMARY_CSV


# --- koşu durumu -----------------------------------------------------------


def _dump_item(item: Any) -> Any:
    if hasattr(item, "model_dump"):
        return item.model_dump(mode="json")
    if isinstance(item, Mapping):
        return dict(item)
    return item


class RunState:
    """`out/<slug>/state.json` — tag grup sonuçları ve tamamlanan gruplar.

    Dosya biçimi::

        {"step": "tag",
         "groups": {"0": [TagItem...], "3": [...]},
         "completed": [0, 3]}

    Grup sözlüğü anahtarı metindir (JSON); `completed` tamsayı listesidir.
    """

    def __init__(self, out_dir: str | Path) -> None:
        self.out_dir = Path(out_dir)
        self.path = self.out_dir / STATE_FILENAME
        self.data: dict[str, Any] = self._load()

    # -- disk -------------------------------------------------------------

    def _load(self) -> dict[str, Any]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError):
            return {"step": "tag", "groups": {}, "completed": []}
        if not isinstance(raw, dict):
            return {"step": "tag", "groups": {}, "completed": []}
        groups = raw.get("groups")
        if not isinstance(groups, dict):
            groups = {}
        raw["groups"] = {str(key): value for key, value in groups.items()}
        completed = raw.get("completed")
        if not isinstance(completed, list):
            completed = []
        raw["completed"] = sorted(
            int(item) for item in completed if _is_int_like(item)
        )
        raw.setdefault("step", "tag")
        return raw

    def save(self) -> None:
        """Durumu atomik yazar."""
        self.out_dir.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            prefix=".state.", suffix=".tmp", dir=self.out_dir
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(self.data, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.replace(tmp_name, self.path)
        except BaseException:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise

    # -- grup kaydı -------------------------------------------------------

    @property
    def groups(self) -> dict[str, list[Any]]:
        return self.data["groups"]

    @property
    def completed_groups(self) -> list[int]:
        return list(self.data["completed"])

    def record_group(self, index: int, items: Iterable[Any]) -> None:
        """Bir tag grubunun sonucunu yazar ve tamamlandı olarak işaretler."""
        key = str(int(index))
        self.data["groups"][key] = [_dump_item(item) for item in items]
        completed = set(self.data["completed"])
        completed.add(int(index))
        self.data["completed"] = sorted(completed)
        self.save()

    def group_result(self, index: int) -> list[Any] | None:
        return self.data["groups"].get(str(int(index)))

    def is_done(self, index: int) -> bool:
        return int(index) in self.data["completed"]

    def missing_groups(self, total_groups: int) -> list[int]:
        """Koşulması gereken grup indeksleri (0..total_groups-1)."""
        done = set(self.data["completed"])
        return [index for index in range(int(total_groups)) if index not in done]

    def all_items(self) -> list[Any]:
        """Tamamlanan grupların öğeleri, grup sırasıyla."""
        out: list[Any] = []
        for index in sorted(self.data["completed"]):
            out.extend(self.data["groups"].get(str(index), []))
        return out

    def reset(self, step: str = "tag") -> None:
        self.data = {"step": step, "groups": {}, "completed": []}
        self.save()


def _is_int_like(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, str):
        return value.strip().isdigit()
    return False


# --- takip CSV -------------------------------------------------------------


def append_tracking_csv(
    path: str | Path,
    slug: str,
    mekan: str,
    gonderim_tarihi: str = "",
    kanal: str = "",
    yanit_durumu: str = "",
) -> Path:
    """Takip CSV'sine bir satır ekler; başlık yoksa yazar.

    Sütunlar: `slug, mekan, gönderim_tarihi, kanal, yanit_durumu`.
    `kanal` mail/instagram, `yanit_durumu` elle doldurulur.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    needs_header = not target.exists() or target.stat().st_size == 0
    with target.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        if needs_header:
            writer.writerow(TRACKING_HEADER)
        writer.writerow(
            [slug, mekan, gonderim_tarihi, kanal, yanit_durumu]
        )
    return target
