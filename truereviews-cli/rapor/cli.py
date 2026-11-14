"""rapor — TrueReviews Kişisel Rapor CLI (plan §7, §8).

Komutlar:

* ``run``            — tek mekan: tag → aggregate → write → validate → PDF + JSON.
* ``batch``          — klasördeki tüm JSON'lar; tamamlanmış slug atlanır.
* ``compare``        — yalnızca write profili değişir; profil başına tablo.
* ``thinking-test``  — aynı iş farklı düşünme düzeyiyle.
* ``review``         — ``out/`` altındaki raporları listeler.
* ``approve``        — ``out/ready/``ye kopyalar, takip CSV'sine "hazır" yazar.
* ``track``          — takip CSV'sini tablo olarak basar.

Ortak seçenekler: ``--config-dir`` (varsayılan cwd), ``--tag-profile`` /
``--write-profile`` (config ``steps`` değerlerini ezer), ``--lang tr|en``,
``--demo``, ``--no-cache``, ``--out`` (``out/`` kökü).
"""

from __future__ import annotations

import csv
import datetime
import json
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import typer

from rapor import __version__
from rapor import usage as usage_store
from rapor.config import CliOverrides, Config, ConfigError, load_config
from rapor.normalize import NormalizeError, normalize
from rapor.pdf.report import build_pdf
from rapor.pipeline.aggregate import Aggregated, aggregate
from rapor.pipeline.insights import Insights, compute_insights
from rapor.pipeline.metrics import Metrics, compute_metrics
from rapor.pipeline.tag import tag_reviews
from rapor.pipeline.validate import ValidationResult, validate_report
from rapor.pipeline.write import WriteError, write_report
from rapor.ratelimit import DailyQuotaExceeded
from rapor.schemas import Place, Review, WriteResult
from rapor.state import (
    append_tracking_csv,
    batch_summary_path,
    out_dir_for,
    ready_dir,
    slugify,
    tracking_csv_path,
)

app = typer.Typer(
    name="rapor",
    help="TrueReviews Kişisel Rapor — Apify yorum JSON'undan PDF rapor üretir.",
    no_args_is_help=True,
    add_completion=False,
)

QUOTA_MESSAGE = "Günlük kota doldu, yarın devam edin — kaldığı grup state.json'da"


# ---------------------------------------------------------------------------
# Küçük yardımcılar
# ---------------------------------------------------------------------------


def _fail(message: str, code: int = 1) -> None:
    """Temiz hata mesajı yazdırır ve komutu sonlandırır."""
    typer.echo(message, err=True)
    raise typer.Exit(code)


def _normalize_lang(value: str | None) -> str:
    key = str(value or "tr").strip().lower()
    if key not in ("tr", "en"):
        _fail(f"desteklenmeyen dil: '{value}' — tr veya en kullanın")
    return key


def _resolve_config(
    config_dir: Path,
    tag_profile: str | None,
    write_profile: str | None,
) -> Config:
    """Config'i yükler; ``ConfigError`` net mesaja çevrilir (plan §8)."""
    try:
        return load_config(
            CliOverrides(tag_profile=tag_profile, write_profile=write_profile),
            config_dir,
        )
    except ConfigError as exc:
        _fail(str(exc))


def _load_json(path: Path) -> Any:
    target = Path(path).expanduser()
    if not target.is_file():
        _fail(f"Dosya bulunamadı: {target}")
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        _fail(
            f"JSON okunamadı: {target.name} — satır {exc.lineno}, "
            f"kolon {exc.colno}: {exc.msg}"
        )
    except OSError as exc:  # pragma: no cover - izin/disk hataları
        _fail(f"Dosya okunamadı: {target} — {exc}")


def _normalize_input(raw: Any, config: Config) -> tuple[Place, list[Review]]:
    try:
        data = normalize(raw, config.field_map)
    except NormalizeError as exc:
        _fail(f"Girdi okunamadı: {exc}")
    return data.place, list(data.reviews)


def _prepare(path: Path, config: Config) -> tuple[Place, list[Review], str]:
    raw = _load_json(path)
    place, reviews = _normalize_input(raw, config)
    return place, reviews, slugify(place.title)


def _today() -> datetime.date:
    return datetime.date.today()


def _score_text(value: float | None) -> str:
    return "-" if value is None else f"{value:g}"


def _ratio_text(value: float | None) -> str:
    return "-" if value is None else f"%{int(round(float(value) * 100))}"


def _cost_text(value: float | None) -> str:
    return "-" if value is None else f"${value:.6f}"


def _usage_totals(out_dir: Path) -> dict[str, Any]:
    return usage_store.summary(out_dir)


def _ensure_usage_file(out_dir: Path) -> None:
    """LLM çağrısı hiç yapılmadıysa bile ``usage.json`` sözleşmede var (plan §7)."""
    target = Path(out_dir) / usage_store.USAGE_FILENAME
    if target.exists():
        return
    payload = usage_store.load(out_dir)
    _write_json(target, payload)


def _write_json(path: Path, payload: Any) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


def _dump(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def _print_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> None:
    """Basit hizalı metin tablosu (harici bağımlılık yok)."""
    table = [[str(cell) for cell in row] for row in rows]
    widths = [len(str(header)) for header in headers]
    for row in table:
        for index, cell in enumerate(row):
            if index < len(widths):
                widths[index] = max(widths[index], len(cell))

    def render(cells: Sequence[str]) -> str:
        return "  ".join(cell.ljust(widths[index]) for index, cell in enumerate(cells))

    typer.echo(render(list(headers)))
    typer.echo("  ".join("-" * width for width in widths))
    for row in table:
        typer.echo(render(row))


def _hidden(validation: ValidationResult) -> set[str]:
    return set(validation.hidden_blocks)


# ---------------------------------------------------------------------------
# Rapor yükü (report.json)
# ---------------------------------------------------------------------------


def _cluster_lookup(aggregated: Aggregated) -> dict[str, Any]:
    lookup: dict[str, Any] = {}
    for cluster in list(aggregated.praise_topics) + list(aggregated.complaint_topics):
        lookup[str(cluster.name).casefold()] = cluster
    return lookup


def _theme_entries(
    themes: Iterable[Any],
    prefix: str,
    aggregated: Aggregated,
    hidden: set[str],
) -> list[dict[str, Any]]:
    """WriteResult temaları + C adımından koddan gelen rozet sayıları."""
    lookup = _cluster_lookup(aggregated)
    entries: list[dict[str, Any]] = []
    for index, theme in enumerate(themes):
        payload = dict(_dump(theme))
        block = f"{prefix}:{index}:{payload.get('name', '')}"
        if block in hidden:
            continue
        review_ids = [str(item) for item in payload.get("review_ids") or []]
        payload["review_ids"] = review_ids
        payload["review_count"] = len(review_ids)
        payload["strength"] = "strong" if len(review_ids) >= 3 else "watch"
        cluster = lookup.get(str(payload.get("name", "")).casefold())
        if cluster is not None:
            payload["average_stars"] = cluster.average_stars
            payload["recent_count"] = cluster.recent_count
            payload["date_start"] = _dump(cluster.date_start)
            payload["date_end"] = _dump(cluster.date_end)
        entries.append(payload)
    return entries


def _build_report_payload(
    *,
    place: Place,
    metrics: Metrics,
    insights: Insights,
    aggregated: Aggregated,
    write_result: WriteResult,
    validation: ValidationResult,
    config: Config,
    lang: str,
    demo: bool,
    report_date: datetime.date,
    warnings: list[str],
    pdf: Any,
) -> dict[str, Any]:
    hidden = _hidden(validation)
    themes_praise = _theme_entries(
        write_result.themes_praise, "theme_praise", aggregated, hidden
    )
    themes_complaint = _theme_entries(
        write_result.themes_complaint, "theme_complaint", aggregated, hidden
    )

    products: list[dict[str, Any]] = []
    if "products_praised" not in hidden:
        for product in write_result.products_praised:
            payload = dict(_dump(product))
            review_ids = [str(item) for item in payload.get("review_ids") or []]
            payload["review_ids"] = review_ids
            payload["review_count"] = len(review_ids)
            payload["strength"] = "strong" if len(review_ids) >= 3 else "watch"
            products.append(payload)

    instagram_caption = ""
    if "instagram_caption" not in hidden:
        instagram_caption = write_result.instagram_caption

    single_step: dict[str, Any] | None = None
    if "single_step" not in hidden:
        single_step = dict(_dump(write_result.single_step))

    drafts: dict[str, str] = {}
    for index, draft in enumerate(write_result.unanswered_reply_drafts):
        if f"unanswered_reply_drafts:{index}" in hidden:
            continue
        drafts[str(draft.review_id)] = draft.reply

    unanswered: list[dict[str, Any]] = []
    for item in aggregated.unanswered_list:
        payload = dict(_dump(item))
        reply = drafts.get(str(payload.get("id")))
        if reply is not None:
            payload["reply"] = reply
        unanswered.append(payload)

    return {
        "meta": {
            "run_date": report_date.isoformat(),
            "lang": lang,
            "demo": demo,
            "profiles": {
                "tag": config.steps.tag.profile,
                "write": config.steps.write.profile,
            },
            "trimmed": list(getattr(pdf, "trimmed", []) or []),
            "sections": list(getattr(pdf, "sections", []) or []),
        },
        "place": _dump(place),
        "scope": _dump(metrics.scope),
        "metrics": _dump(metrics),
        "insights": _dump(insights),
        "verdict": insights.verdict,
        "themes_praise": themes_praise,
        "themes_complaint": themes_complaint,
        "products": products,
        "instagram_caption": instagram_caption,
        "unanswered": unanswered,
        "single_step": single_step,
        "warnings": list(warnings),
        "validation": {
            "ratio": validation.ratio,
            "hidden_blocks": list(validation.hidden_blocks),
            "valid_blocks": validation.valid_blocks,
            "total_blocks": validation.total_blocks,
            "schema_valid": validation.schema_valid,
        },
    }


def _build_review_md(
    *,
    report: Mapping[str, Any],
    metrics: Metrics,
    insights: Insights,
    validation: ValidationResult,
    usage_totals: Mapping[str, Any],
    pdf: Any,
) -> str:
    place = report.get("place") or {}
    warnings = list(report.get("warnings") or [])
    hidden = list(validation.hidden_blocks)
    lines = [
        f"# {place.get('title') or 'Mekan'} — TrueReviews raporu",
        "",
        f"- Skor: {_score_text(metrics.score)}/100 ({insights.band_label or '-'})",
        f"- Bant: {insights.band_label or '-'}",
        f"- Doğrulama oranı: {_ratio_text(validation.ratio)} "
        f"({validation.valid_blocks}/{validation.total_blocks} blok)",
        f"- Gizlenen bölümler: {', '.join(hidden) if hidden else 'yok'}",
        f"- PDF: {getattr(pdf, 'page_count', '?')} sayfa — {getattr(pdf, 'path', '')}",
        f"- Uyarı sayısı: {len(warnings)}",
        "- Kullanım: "
        f"{usage_totals.get('calls', 0)} çağrı, "
        f"{usage_totals.get('total_tokens', 0)} token, "
        f"{_cost_text(usage_totals.get('cost'))}",
        "",
    ]
    if insights.verdict:
        lines.extend([insights.verdict, ""])
    lines.append("## Uyarılar")
    if warnings:
        lines.extend(f"- {warning}" for warning in warnings)
    else:
        lines.append("- yok")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Çalıştırma çekirdeği
# ---------------------------------------------------------------------------


@dataclass
class RunOutcome:
    """Bir mekanın tek koşusunun çıktısı."""

    slug: str
    out_dir: Path
    pdf_path: Path
    page_count: int
    report: dict[str, Any]
    metrics: Metrics
    insights: Insights
    validation: ValidationResult
    usage: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    duration_s: float = 0.0


def _check_keys(config: Config) -> None:
    """Kullanılan profillerin API anahtarını erken çözer (plan §8 net hata).

    Yalnızca ``api_key_env`` tanımlı profiller denetlenir; anahtar gerektirmeyen
    adaptörler (``mock``, ``opencode``) etkilenmez.
    """
    for step in ("tag", "write"):
        profile = config.profile_for_step(step)
        if not profile.api_key_env:
            continue
        try:
            config.api_key(profile.name)
        except ConfigError as exc:
            _fail(str(exc))


def _execute(
    *,
    place: Place,
    reviews: list[Review],
    config: Config,
    out_dir: Path,
    slug: str,
    lang: str,
    demo: bool,
    use_cache: bool,
    report_date: datetime.date,
    tags: list[Any] | None = None,
) -> RunOutcome:
    """Normalize edilmiş mekanı uçtan uca çalıştırır (plan §5, §7)."""
    started = time.monotonic()
    _check_keys(config)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    metrics = compute_metrics(place, reviews, config, today=report_date)
    insights = compute_insights(
        metrics, reviews, config, lang=lang, today=report_date
    )
    _write_json(out_dir / "metrics.json", _dump(metrics))

    warnings: list[str] = []
    if tags is None:
        tag_result = tag_reviews(
            reviews, config, out_dir, use_cache=use_cache, lang=lang
        )
        tags = list(tag_result)
        warnings.extend(getattr(tag_result, "warnings", []) or [])

    aggregated = aggregate(reviews, list(tags), config, lang=lang, today=report_date)

    try:
        write_result = write_report(
            metrics,
            insights,
            aggregated,
            reviews,
            config,
            out_dir,
            lang=lang,
            use_cache=use_cache,
        )
    except WriteError as exc:
        _fail(f"Rapor metni üretilemedi: {exc}")

    validation = validate_report(write_result, reviews, metrics, insights, aggregated)
    warnings.extend(validation.warnings)

    pdf = build_pdf(
        out_dir,
        place,
        metrics,
        insights,
        aggregated,
        write_result,
        validation,
        config,
        lang=lang,
        demo=demo,
        report_date=report_date,
    )

    warnings.extend(list(getattr(pdf, "trimmed", []) or []))
    # build_pdf, dizin adı slug değilse PDF'i slug altına yazar (compare/thinking
    # dizinleri `<slug>-<varyant>`). Rapor dosyalarıyla aynı yerde tut.
    pdf_path = Path(getattr(pdf, "path", out_dir / "rapor.pdf"))
    if pdf_path.parent != out_dir:
        destination = out_dir / pdf_path.name
        shutil.move(str(pdf_path), str(destination))
        try:
            pdf.path = destination
        except AttributeError:  # pragma: no cover - donmuş sonuç nesnesi
            pass
        pdf_path = destination
    _ensure_usage_file(out_dir)
    usage_totals = _usage_totals(out_dir)

    report = _build_report_payload(
        place=place,
        metrics=metrics,
        insights=insights,
        aggregated=aggregated,
        write_result=write_result,
        validation=validation,
        config=config,
        lang=lang,
        demo=demo,
        report_date=report_date,
        warnings=warnings,
        pdf=pdf,
    )
    _write_json(out_dir / "report.json", report)
    (out_dir / "review.md").write_text(
        _build_review_md(
            report=report,
            metrics=metrics,
            insights=insights,
            validation=validation,
            usage_totals=usage_totals,
            pdf=pdf,
        ),
        encoding="utf-8",
    )

    return RunOutcome(
        slug=slug,
        out_dir=out_dir,
        pdf_path=pdf_path,
        page_count=int(getattr(pdf, "page_count", 0) or 0),
        report=report,
        metrics=metrics,
        insights=insights,
        validation=validation,
        usage=usage_totals,
        warnings=warnings,
        duration_s=time.monotonic() - started,
    )


def _summary_line(outcome: RunOutcome) -> str:
    return (
        f"Skor: {_score_text(outcome.metrics.score)}/100 "
        f"({outcome.insights.band_label or '-'}) · "
        f"Doğrulama: {_ratio_text(outcome.validation.ratio)} · "
        f"Uyarı: {len(outcome.warnings)}"
    )


# ---------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------


@app.command()
def run(
    mekan_json: Path = typer.Argument(..., help="Apify yorum JSON'u."),
    config_dir: Path = typer.Option(Path("."), "--config-dir", help="Config klasörü."),
    tag_profile: str | None = typer.Option(None, "--tag-profile", help="Tag profilini ezer."),
    write_profile: str | None = typer.Option(None, "--write-profile", help="Write profilini ezer."),
    lang: str = typer.Option("tr", "--lang", help="Rapor dili: tr | en."),
    demo: bool = typer.Option(False, "--demo", help="ÖRNEK filigranı ekler."),
    no_cache: bool = typer.Option(False, "--no-cache", help="LLM cache'ini kapatır."),
    out: Path = typer.Option(Path("."), "--out", help="out/ kökü."),
) -> None:
    """Tek mekan için rapor üretir."""
    language = _normalize_lang(lang)
    config = _resolve_config(config_dir, tag_profile, write_profile)
    place, reviews, slug = _prepare(mekan_json, config)
    report_date = _today()
    out_dir = out_dir_for(Path(out).expanduser(), slug)

    try:
        outcome = _execute(
            place=place,
            reviews=reviews,
            config=config,
            out_dir=out_dir,
            slug=slug,
            lang=language,
            demo=demo,
            use_cache=not no_cache,
            report_date=report_date,
        )
    except DailyQuotaExceeded:
        _fail(QUOTA_MESSAGE)

    typer.echo(f"PDF: {outcome.pdf_path}")
    typer.echo(_summary_line(outcome))


# ---------------------------------------------------------------------------
# batch
# ---------------------------------------------------------------------------


@app.command()
def batch(
    klasor: Path = typer.Argument(..., help="JSON dosyalarının bulunduğu klasör."),
    config_dir: Path = typer.Option(Path("."), "--config-dir"),
    tag_profile: str | None = typer.Option(None, "--tag-profile"),
    write_profile: str | None = typer.Option(None, "--write-profile"),
    lang: str = typer.Option("tr", "--lang"),
    demo: bool = typer.Option(False, "--demo"),
    no_cache: bool = typer.Option(False, "--no-cache"),
    out: Path = typer.Option(Path("."), "--out"),
) -> None:
    """Klasördeki tüm JSON'ları işler; tamamlanmış slug'ları atlar."""
    language = _normalize_lang(lang)
    config = _resolve_config(config_dir, tag_profile, write_profile)
    folder = Path(klasor).expanduser()
    if not folder.is_dir():
        _fail(f"Klasör bulunamadı: {folder}")

    out_root = Path(out).expanduser()
    report_date = _today()
    files = sorted(path for path in folder.glob("*.json") if path.is_file())
    if not files:
        _fail(f"Klasörde JSON dosyası yok: {folder}")

    rows: list[list[str]] = []
    quota_hit = False

    for path in files:
        try:
            place, reviews, slug = _prepare(path, config)
        except typer.Exit:
            rows.append([path.stem, "-", "hata", "girdi okunamadı", "-", "-"])
            typer.echo(f"! {path.name}: girdi okunamadı", err=True)
            continue

        existing = out_root / "out" / slug / "report.json"
        if existing.is_file():
            try:
                report = json.loads(existing.read_text(encoding="utf-8"))
                score = (report.get("metrics") or {}).get("score")
                warning_count = len(report.get("warnings") or [])
                totals = _usage_totals(existing.parent)
                token = totals.get("total_tokens", 0)
                cost = _cost_text(totals.get("cost"))
            except (OSError, json.JSONDecodeError):
                score, warning_count, token, cost = None, 0, 0, "-"
            typer.echo(f"= {slug}: tamamlanmış, atlandı")
            rows.append(
                [place.title or slug, _score_text(score), "atlandı", str(warning_count), str(token), cost]
            )
            continue

        try:
            outcome = _execute(
                place=place,
                reviews=reviews,
                config=config,
                out_dir=out_dir_for(out_root, slug),
                slug=slug,
                lang=language,
                demo=demo,
                use_cache=not no_cache,
                report_date=report_date,
            )
        except DailyQuotaExceeded:
            quota_hit = True
            typer.echo(f"! {slug}: {QUOTA_MESSAGE}", err=True)
            rows.append([place.title or slug, "-", "kota", "günlük kota", "-", "-"])
            break
        except typer.Exit:
            rows.append([place.title or slug, "-", "hata", "koşu başarısız", "-", "-"])
            continue
        except Exception as exc:  # tek mekan hatası batch'i durdurmaz
            typer.echo(f"! {slug}: {exc}", err=True)
            rows.append([place.title or slug, "-", "hata", str(exc)[:120], "-", "-"])
            continue

        typer.echo(f"✓ {slug}: {_summary_line(outcome)}")
        rows.append(
            [
                place.title or slug,
                _score_text(outcome.metrics.score),
                "tamam",
                str(len(outcome.warnings)),
                str(outcome.usage.get("total_tokens", 0)),
                _cost_text(outcome.usage.get("cost")),
            ]
        )

    summary_path = batch_summary_path(out_root)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    with summary_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["mekan", "skor", "durum", "uyarı", "token", "maliyet"])
        writer.writerows(rows)

    typer.echo(f"Özet: {summary_path}")
    if quota_hit:
        _fail(QUOTA_MESSAGE)


# ---------------------------------------------------------------------------
# compare / thinking-test
# ---------------------------------------------------------------------------


def _profile_names(value: str) -> list[str]:
    names = [item.strip() for item in str(value or "").split(",") if item.strip()]
    if not names:
        _fail("--profiles boş — virgülle ayrılmış profil adları verin")
    return names


def _single_step_text(report: Mapping[str, Any]) -> str:
    step = report.get("single_step") or {}
    action = str(step.get("action") or "").strip()
    return action if action else "(gizlendi)"


@app.command()
def compare(
    mekan_json: Path = typer.Argument(..., help="Apify yorum JSON'u."),
    profiles: str = typer.Option(..., "--profiles", help="Virgülle ayrılmış write profilleri."),
    config_dir: Path = typer.Option(Path("."), "--config-dir"),
    tag_profile: str | None = typer.Option(None, "--tag-profile", help="Tag sabit kalır."),
    lang: str = typer.Option("tr", "--lang"),
    demo: bool = typer.Option(False, "--demo"),
    no_cache: bool = typer.Option(False, "--no-cache"),
    out: Path = typer.Option(Path("."), "--out"),
) -> None:
    """Write profilini değiştirerek profilleri karşılaştırır (tag sabit)."""
    language = _normalize_lang(lang)
    names = _profile_names(profiles)
    out_root = Path(out).expanduser()
    report_date = _today()

    base_config = _resolve_config(config_dir, tag_profile, None)
    place, reviews, slug = _prepare(mekan_json, base_config)

    # Tag bir kez koşar; ortak state/cache klasörü.
    tag_dir = out_root / "out" / "compare" / f"{slug}-tag"
    tag_dir.mkdir(parents=True, exist_ok=True)
    _check_keys(base_config)
    try:
        tags = list(
            tag_reviews(reviews, base_config, tag_dir, use_cache=not no_cache, lang=language)
        )
    except DailyQuotaExceeded:
        _fail(QUOTA_MESSAGE)

    rows: list[list[str]] = []
    for name in names:
        config = _resolve_config(config_dir, tag_profile, name)
        out_dir = out_root / "out" / "compare" / f"{slug}-{slugify(name)}"
        try:
            outcome = _execute(
                place=place,
                reviews=reviews,
                config=config,
                out_dir=out_dir,
                slug=slug,
                lang=language,
                demo=demo,
                use_cache=not no_cache,
                report_date=report_date,
                tags=tags,
            )
        except DailyQuotaExceeded:
            _fail(QUOTA_MESSAGE)
        except typer.Exit:
            rows.append([name, "hayır", "-", "-", "-", "-", "(hata)"])
            continue

        rows.append(
            [
                name,
                "geçti" if outcome.validation.schema_valid else "kaldı",
                _ratio_text(outcome.validation.ratio),
                f"{outcome.duration_s:.1f}s",
                str(outcome.usage.get("total_tokens", 0)),
                _cost_text(outcome.usage.get("cost")),
                _single_step_text(outcome.report),
            ]
        )

    _print_table(
        ["profil", "şema", "doğrulama", "süre", "token", "maliyet", "tek adım"],
        rows,
    )


@app.command("thinking-test")
def thinking_test(
    mekan_json: Path = typer.Argument(..., help="Apify yorum JSON'u."),
    profile: str = typer.Option(..., "--profile", help="Kullanılacak profil."),
    levels: str = typer.Option("low,medium", "--levels", help="Virgülle ayrılmış düşünme düzeyleri."),
    config_dir: Path = typer.Option(Path("."), "--config-dir"),
    tag_profile: str | None = typer.Option(None, "--tag-profile"),
    lang: str = typer.Option("tr", "--lang"),
    demo: bool = typer.Option(False, "--demo"),
    no_cache: bool = typer.Option(False, "--no-cache"),
    out: Path = typer.Option(Path("."), "--out"),
) -> None:
    """Aynı işi farklı düşünme düzeyleriyle karşılaştırır."""
    language = _normalize_lang(lang)
    level_names = [
        item.strip().lower() for item in str(levels or "").split(",") if item.strip()
    ]
    if not level_names:
        _fail("--levels boş — ör. low,medium")

    out_root = Path(out).expanduser()
    report_date = _today()
    base_config = _resolve_config(config_dir, tag_profile or profile, profile)
    place, reviews, slug = _prepare(mekan_json, base_config)

    rows: list[list[str]] = []
    for level in level_names:
        config = _with_thinking(base_config, level)
        out_dir = out_root / "out" / "thinking" / f"{slug}-{slugify(level)}"
        try:
            outcome = _execute(
                place=place,
                reviews=reviews,
                config=config,
                out_dir=out_dir,
                slug=slug,
                lang=language,
                demo=demo,
                use_cache=not no_cache,
                report_date=report_date,
            )
        except DailyQuotaExceeded:
            _fail(QUOTA_MESSAGE)
        except typer.Exit:
            rows.append([level, "-", "-", "-", "(hata)"])
            continue

        rows.append(
            [
                level,
                str(outcome.usage.get("total_tokens", 0)),
                f"{outcome.duration_s:.1f}s",
                _ratio_text(outcome.validation.ratio),
                _single_step_text(outcome.report),
            ]
        )

    _print_table(["düzey", "token", "süre", "doğrulama", "tek adım"], rows)


def _with_thinking(config: Config, level: str) -> Config:
    """Kullanılan profillerin ``thinking`` alanını ezer (config kopyası)."""
    clone = config.model_copy(deep=True)
    for step in ("tag", "write"):
        name = clone.steps.tag.profile if step == "tag" else clone.steps.write.profile
        profile = clone.providers.get(name)
        if profile is not None:
            clone.providers[name] = profile.model_copy(update={"thinking": level})
    return clone


# ---------------------------------------------------------------------------
# review / approve / track
# ---------------------------------------------------------------------------


def _out_root_for(folder: Path) -> Path:
    folder = Path(folder).expanduser()
    if folder.name == "out":
        return folder.parent
    if (folder / "out").is_dir():
        return folder
    return folder


@app.command()
def review(
    klasor: Path = typer.Argument(Path("out"), help="out/ klasörü ya da proje kökü."),
) -> None:
    """`out/` altındaki raporları listeler."""
    folder = Path(klasor).expanduser()
    if not folder.is_dir():
        _fail(f"Klasör bulunamadı: {folder}")
    out_root = _out_root_for(folder)
    base = out_root / "out" if (out_root / "out").is_dir() else out_root
    ready = base / "ready"
    ready_names = (
        {path.stem for path in ready.glob("*.pdf")} | {path.name for path in ready.glob("*")}
        if ready.is_dir()
        else set()
    )

    rows: list[list[str]] = []
    for report_path in sorted(base.glob("*/report.json")):
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        slug = report_path.parent.name
        score = (report.get("metrics") or {}).get("score")
        warnings = len(report.get("warnings") or [])
        ratio = (report.get("validation") or {}).get("ratio")
        approved = "✓" if slug in ready_names else ""
        rows.append([slug, _score_text(score), str(warnings), _ratio_text(ratio), approved])

    if not rows:
        typer.echo(f"Rapor bulunamadı: {base}")
        return

    _print_table(["slug", "skor", "uyarı", "doğrulama", "onay"], rows)


@app.command()
def approve(
    slug: str = typer.Argument(..., help="Onaylanacak rapor slug'ı."),
    out: Path = typer.Option(Path("."), "--out", help="out/ kökü."),
) -> None:
    """Raporu `out/ready/`ye kopyalar ve takibe "hazır" yazar."""
    out_root = Path(out).expanduser()
    source = out_root / "out" / slug / "rapor.pdf"
    if not source.is_file():
        _fail(f"PDF bulunamadı: {source}")

    destination = ready_dir(out_root) / f"{slug}.pdf"
    shutil.copy2(source, destination)

    csv_path = tracking_csv_path(out_root)
    existing_slugs = _tracking_slugs(csv_path)
    if slug not in existing_slugs:
        mekan = _place_title(out_root / "out" / slug / "report.json") or slug
        append_tracking_csv(
            csv_path,
            slug=slug,
            mekan=mekan,
            gonderim_tarihi="",
            kanal="",
            yanit_durumu="hazır",
        )

    typer.echo(f"Kopyalandı: {destination}")


def _place_title(report_path: Path) -> str | None:
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    place = report.get("place") or {}
    title = str(place.get("title") or "").strip()
    return title or None


def _tracking_slugs(csv_path: Path) -> set[str]:
    if not csv_path.is_file():
        return set()
    try:
        with csv_path.open(encoding="utf-8", newline="") as handle:
            return {str(row.get("slug") or "") for row in csv.DictReader(handle)}
    except OSError:  # pragma: no cover
        return set()


@app.command()
def track(
    out: Path = typer.Option(Path("."), "--out", help="out/ kökü."),
) -> None:
    """Takip CSV'sini tablo olarak yazdırır (elle güncellenir)."""
    csv_path = tracking_csv_path(Path(out).expanduser())
    if not csv_path.is_file():
        typer.echo(f"Takip dosyası yok: {csv_path}")
        return

    rows: list[list[str]] = []
    with csv_path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            rows.append(
                [
                    str(row.get("mekan") or row.get("slug") or ""),
                    str(row.get("gönderim_tarihi") or ""),
                    str(row.get("kanal") or ""),
                    str(row.get("yanit_durumu") or ""),
                ]
            )

    if not rows:
        typer.echo("Takip kaydı boş.")
        return

    _print_table(["mekan", "gönderim tarihi", "kanal", "yanıt durumu"], rows)


# ---------------------------------------------------------------------------
# version
# ---------------------------------------------------------------------------


@app.callback()
def main() -> None:
    """TrueReviews Kişisel Rapor — Apify yorum JSON'undan PDF rapor üretir."""


@app.command()
def version() -> None:
    """Sürüm bilgisini yazdırır."""
    typer.echo(__version__)


if __name__ == "__main__":
    app()
