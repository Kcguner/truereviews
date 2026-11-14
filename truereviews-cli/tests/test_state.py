"""`rapor/state.py` testleri (plan §3, §7, §8)."""

from __future__ import annotations

import csv
import json

from rapor.schemas import TagItem
from rapor.state import (
    BATCH_SUMMARY_CSV,
    TRACKING_CSV,
    TRACKING_HEADER,
    RunState,
    append_tracking_csv,
    batch_summary_path,
    out_dir_for,
    ready_dir,
    slugify,
    tracking_csv_path,
)


# --- slugify ---------------------------------------------------------------


def test_slugify_turkish_characters():
    assert slugify("Örnek Pasta & Cafe") == "ornek-pasta-ve-cafe"
    assert slugify("Şişli Çiya Çorbacısı") == "sisli-ciya-corbacisi"
    assert slugify("Ğ harfi İĞÜŞÖÇ") == "g-harfi-igusoc"


def test_slugify_punctuation_and_spaces():
    assert slugify("  Kafe -- 34!! ") == "kafe-34"
    assert slugify("") == "mekan"
    assert slugify("***") == "mekan"


def test_slugify_is_filesystem_safe():
    slug = slugify("A/B\\C:D*E?F\"G<H>I|J")
    assert "/" not in slug and "\\" not in slug and ":" not in slug
    assert slug == "a-b-c-d-e-f-g-h-i-j"


# --- dizinler --------------------------------------------------------------


def test_out_dir_for_creates_directory(tmp_path):
    directory = out_dir_for(tmp_path, "mekan")
    assert directory == tmp_path / "out" / "mekan"
    assert directory.is_dir()


def test_ready_dir_and_csv_paths(tmp_path):
    assert ready_dir(tmp_path) == tmp_path / "out" / "ready"
    assert ready_dir(tmp_path).is_dir()
    assert tracking_csv_path(tmp_path) == tmp_path / "out" / TRACKING_CSV
    assert batch_summary_path(tmp_path) == tmp_path / "out" / BATCH_SUMMARY_CSV


# --- RunState --------------------------------------------------------------


def make_item(index: int) -> TagItem:
    return TagItem(
        id=f"r{index}",
        sentiment="positive",
        topics=["lezzet"],
        products=[],
        severity=1,
    )


def test_run_state_records_group(tmp_path):
    out_dir = out_dir_for(tmp_path, "mekan")
    state = RunState(out_dir)
    state.record_group(0, [make_item(1), make_item(2)])
    assert state.completed_groups == [0]
    assert len(state.group_result(0)) == 2

    reloaded = RunState(out_dir)
    assert reloaded.completed_groups == [0]
    assert reloaded.group_result(0)[0]["id"] == "r1"


def test_state_file_shape(tmp_path):
    out_dir = out_dir_for(tmp_path, "mekan")
    state = RunState(out_dir)
    state.record_group(3, [make_item(9)])
    payload = json.loads((out_dir / "state.json").read_text(encoding="utf-8"))
    assert payload["step"] == "tag"
    assert list(payload["groups"]) == ["3"]
    assert payload["completed"] == [3]


def test_missing_groups_skips_completed(tmp_path):
    out_dir = out_dir_for(tmp_path, "mekan")
    state = RunState(out_dir)
    state.record_group(0, [make_item(1)])
    state.record_group(2, [make_item(3)])
    assert state.missing_groups(4) == [1, 3]
    assert state.missing_groups(2) == [1]


def test_resume_only_runs_missing_groups(tmp_path):
    out_dir = out_dir_for(tmp_path, "mekan")
    RunState(out_dir).record_group(0, [make_item(1)])

    state = RunState(out_dir)
    ran: list[int] = []
    for index in state.missing_groups(3):
        ran.append(index)
        state.record_group(index, [make_item(index + 10)])
    assert ran == [1, 2]
    assert RunState(out_dir).missing_groups(3) == []


def test_record_group_is_idempotent(tmp_path):
    out_dir = out_dir_for(tmp_path, "mekan")
    state = RunState(out_dir)
    state.record_group(0, [make_item(1)])
    state.record_group(0, [make_item(2), make_item(3)])
    assert state.completed_groups == [0]
    assert len(state.group_result(0)) == 2


def test_all_items_in_group_order(tmp_path):
    out_dir = out_dir_for(tmp_path, "mekan")
    state = RunState(out_dir)
    state.record_group(1, [make_item(2)])
    state.record_group(0, [make_item(1)])
    ids = [item["id"] for item in state.all_items()]
    assert ids == ["r1", "r2"]


def test_corrupt_state_file_is_ignored(tmp_path):
    out_dir = out_dir_for(tmp_path, "mekan")
    (out_dir / "state.json").write_text("{bozuk", encoding="utf-8")
    state = RunState(out_dir)
    assert state.completed_groups == []
    assert state.missing_groups(2) == [0, 1]


def test_reset_clears_groups(tmp_path):
    out_dir = out_dir_for(tmp_path, "mekan")
    state = RunState(out_dir)
    state.record_group(0, [make_item(1)])
    state.reset()
    assert RunState(out_dir).completed_groups == []


# --- takip CSV -------------------------------------------------------------


def test_append_tracking_csv_writes_header_once(tmp_path):
    path = tracking_csv_path(tmp_path)
    append_tracking_csv(path, "mekan", "Mekan", "2026-11-14", "mail", "bekliyor")
    append_tracking_csv(path, "mekan-2", "Mekan 2", "2026-11-15", "instagram", "")

    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle))
    assert tuple(rows[0]) == TRACKING_HEADER
    assert len(rows) == 3
    assert rows[1] == ["mekan", "Mekan", "2026-11-14", "mail", "bekliyor"]
    assert rows[2][0] == "mekan-2"
