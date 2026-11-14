"""Config katmanı: `providers.yaml` + `config.yaml` + `.env` (plan §3, §4, §5-A2).

Sözleşme:

    load_config(cli_overrides, config_dir) -> Config

- Eksik dosya / eksik alan / bilinmeyen adaptör / geçersiz thinking → `ConfigError`.
- API anahtarı **yüklemede** aranmaz; yalnızca profil kullanılınca (`Config.api_key`)
  çözülür. Böylece mock/test profilleri anahtarsız çalışır.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Mapping

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from .schemas import GEMINI_MINIMAL_REJECTED_MODELS

KNOWN_ADAPTERS: tuple[str, ...] = ("gemini", "openai_compat", "opencode", "mock")


class ConfigError(Exception):
    """Kullanıcıya gösterilecek config/kurulum hatası (net mesaj taşır)."""


# --- Modeller --------------------------------------------------------------


class Pricing(BaseModel):
    """1M token başına USD. Fiyat yoksa `None`; maliyet alanı boş kalır."""

    model_config = ConfigDict(extra="ignore")

    input: float | None = None
    output: float | None = None


class ProviderProfile(BaseModel):
    """Adlandırılmış sağlayıcı profili (plan §3 `providers.yaml`)."""

    model_config = ConfigDict(extra="ignore")

    name: str
    adapter: str
    model: str = Field(min_length=1)
    base_url: str | None = None
    api_key_env: str | None = None
    thinking: str | None = None
    max_tokens: int = Field(default=4096, gt=0)
    concurrency: int = Field(default=1, ge=1)
    requests_per_minute: int | None = Field(default=None, ge=1)
    daily_request_limit: int | None = Field(default=None, ge=1)
    pricing: Pricing | None = None
    extra_body: dict[str, Any] = Field(default_factory=dict)

    @field_validator("adapter")
    @classmethod
    def _lower_adapter(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("thinking")
    @classmethod
    def _normalize_thinking(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip().lower()
        return cleaned or None

    @field_validator("base_url", "api_key_env")
    @classmethod
    def _strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


class StepConfig(BaseModel):
    profile: str = Field(min_length=1)


class StepsConfig(BaseModel):
    tag: StepConfig
    write: StepConfig


class ScoreWeights(BaseModel):
    """Skor ağırlıkları (plan §5-A, varsayılan 0.60/0.25/0.15)."""

    model_config = ConfigDict(extra="ignore")

    average: float = 0.60  # w1: genel ortalama / 5
    positive_ratio: float = 0.25  # w2: olumlu oran (4–5★)
    recent: float = 0.15  # w3: son 90 gün ortalaması / 5

    @model_validator(mode="after")
    def _sum_is_one(self) -> "ScoreWeights":
        total = self.average + self.positive_ratio + self.recent
        if abs(total - 1.0) > 1e-3:
            raise ValueError(
                f"ağırlık toplamı 1.0 olmalı, şu an {total:.3f} "
                "(average + positive_ratio + recent)"
            )
        return self


class Scoring(BaseModel):
    model_config = ConfigDict(extra="ignore")

    weights: ScoreWeights = Field(default_factory=ScoreWeights)


class Band(BaseModel):
    """Skor bandı (plan §5-A2). `name` makine anahtarı, `label` rapor metni."""

    model_config = ConfigDict(extra="ignore")

    name: str
    label: str
    min: int = Field(ge=0, le=100)
    max: int = Field(ge=0, le=100)


class Tagging(BaseModel):
    model_config = ConfigDict(extra="ignore")

    group_size: int = Field(default=20, gt=0)
    max_group_retries: int = Field(default=2, ge=0)


class PdfFooter(BaseModel):
    """Alt satır (plan §6 madde 11). CTA config'ten kapatılabilir."""

    model_config = ConfigDict(extra="ignore")

    cta_enabled: bool = True
    cta_text: str = (
        "İsterseniz bu raporu her ay yeni yorumlarla güncelleyip size gönderelim."
    )
    brand: str = "TrueReviews"
    owner_name: str = "Kaan Can Güner"
    email: str = "kcguner@gmail.com"
    signature: str = "<KCG />"


class PdfSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    footer: PdfFooter = Field(default_factory=PdfFooter)


class CliOverrides(BaseModel):
    """CLI `--tag-profile` / `--write-profile` ezmeleri."""

    model_config = ConfigDict(extra="ignore")

    tag_profile: str | None = None
    write_profile: str | None = None


class Config(BaseModel):
    """Doğrulanmış, tipli çalışma config'i."""

    model_config = ConfigDict(extra="ignore")

    providers: dict[str, ProviderProfile]
    steps: StepsConfig
    field_map: dict[str, str]
    topic_aliases: dict[str, list[str]] = Field(default_factory=dict)
    scoring: Scoring = Field(default_factory=Scoring)
    bands: list[Band]
    tagging: Tagging = Field(default_factory=Tagging)
    pdf: PdfSettings = Field(default_factory=PdfSettings)

    config_dir: Path = Field(default=Path("."), exclude=True)
    dotenv_path: Path | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def _bands_cover_0_100(self) -> "Config":
        if not self.bands:
            raise ValueError("bands boş olamaz")
        ordered = sorted(self.bands, key=lambda band: band.min)
        if ordered[0].min != 0 or ordered[-1].max != 100:
            raise ValueError("bands 0'dan 100'e kadar kapsamalı (ilk min=0, son max=100)")
        for previous, current in zip(ordered, ordered[1:]):
            if current.min != previous.max + 1:
                raise ValueError(
                    f"bands aralıkları bitişik olmalı: {previous.max} sonrası "
                    f"{previous.max + 1} bekleniyor, {current.min} geldi"
                )
        if not any(band.min <= 100 <= band.max for band in ordered):
            raise ValueError("bands 100 puanını kapsamalı")
        return self

    # -- profil erişimi -----------------------------------------------------

    def profile(self, name: str) -> ProviderProfile:
        try:
            return self.providers[name]
        except KeyError:
            available = ", ".join(sorted(self.providers)) or "(yok)"
            raise ConfigError(
                f"'{name}' profili providers.yaml'da yok — mevcut profiller: {available}"
            ) from None

    def profile_for_step(self, step: str) -> ProviderProfile:
        if step == "tag":
            return self.profile(self.steps.tag.profile)
        if step == "write":
            return self.profile(self.steps.write.profile)
        raise ConfigError(f"bilinmeyen adım: {step} (tag|write)")

    # -- API anahtarı (tembel çözümleme) -----------------------------------

    def api_key(self, name: str) -> str | None:
        """Profilin `api_key_env` değişkenini çözer. Anahtar yoksa net hata.

        `adapter: mock` ve `api_key_env` tanımsız profiller `None` döner.
        """
        profile = self.profile(name)
        env_name = profile.api_key_env
        if not env_name:
            if profile.adapter == "mock":
                return None
            raise ConfigError(
                f"'{profile.name}' profili için api_key_env tanımlı değil — "
                "providers.yaml'da api_key_env ekleyin"
            )
        value = os.environ.get(env_name)
        if not value:
            raise ConfigError(f"{env_name} tanımlı değil — .env dosyasına ekleyin")
        return value

    def api_key_for(self, profile: ProviderProfile) -> str | None:
        return self.api_key(profile.name)

    # -- skor bandı ---------------------------------------------------------

    def band_for(self, score: float) -> Band:
        # Bantlar tamsayı sınırlarıyla tanımlı; 84.6 → 84 → "İyi".
        clamped = max(0, min(100, int(float(score))))
        for band in self.bands:
            if band.min <= clamped <= band.max:
                return band
        return self.bands[-1]


# --- Sabitler --------------------------------------------------------------

# `field_map` config'te tanımlıdır; config.yaml eksik bırakırsa bu varsayılan
# kullanılır. Farklı bir Apify actor'ü için config.yaml'daki `field_map`'i ez.
# Anahtarlar `normalize.py` ile birebir aynıdır (mantıksal ad → Apify alanı).
DEFAULT_FIELD_MAP: dict[str, str] = {
    "text": "text",
    "stars": "stars",
    "date": "publishedAtDate",
    "id": "reviewId",
    "owner_response": "responseFromOwnerText",
    "images": "reviewImageUrls",
    "context": "reviewContext",
    "detailed_ratings": "reviewDetailedRating",
    "language": "originalLanguage",
    "title": "title",
    "category": "categoryName",
    "city": "city",
    "country_code": "countryCode",
    "total_score": "totalScore",
    "reviews_count": "reviewsCount",
}

DEFAULT_BANDS: tuple[dict[str, Any], ...] = (
    {"name": "zayif", "label": "Zayıf", "min": 0, "max": 49},
    {"name": "orta", "label": "Orta", "min": 50, "max": 69},
    {"name": "iyi", "label": "İyi", "min": 70, "max": 84},
    {"name": "cok_iyi", "label": "Çok iyi", "min": 85, "max": 100},
)

_REQUIRED_FIELD_MAP_KEYS: tuple[str, ...] = tuple(DEFAULT_FIELD_MAP)


# --- Yükleme ---------------------------------------------------------------


def _format_validation_error(exc: ValidationError) -> str:
    parts: list[str] = []
    for error in exc.errors():
        location = ".".join(str(item) for item in error["loc"]) or "(kök)"
        parts.append(f"{location}: {error['msg']}")
    return "; ".join(parts) if parts else str(exc)


def _load_yaml(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ConfigError(f"{path.name} okunamadı (geçersiz YAML): {exc}") from exc
    except OSError as exc:
        raise ConfigError(f"{path.name} okunamadı: {exc}") from exc
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ConfigError(f"{path.name}: kök bölüm bir sözlük olmalı")
    return raw


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    try:
        from dotenv import load_dotenv
    except ImportError:  # python-dotenv yoksa küçük yedek ayrıştırıcı
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            if stripped.startswith("export "):
                stripped = stripped[len("export ") :]
            key, _, value = stripped.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)
        return
    load_dotenv(dotenv_path=path, override=False)


def _validate_profile(profile: ProviderProfile) -> None:
    if profile.adapter not in KNOWN_ADAPTERS:
        known = ", ".join(KNOWN_ADAPTERS)
        raise ConfigError(
            f"'{profile.name}' profilinde bilinmeyen adaptör: '{profile.adapter}' — "
            f"bilinen adaptörler: {known}"
        )
    if profile.adapter == "openai_compat" and not profile.base_url:
        raise ConfigError(
            f"'{profile.name}' profili için base_url zorunlu (adapter: openai_compat)"
        )
    if (
        profile.adapter == "gemini"
        and profile.model in GEMINI_MINIMAL_REJECTED_MODELS
        and profile.thinking == "minimal"
    ):
        raise ConfigError(
            f"'{profile.name}': {profile.model} 'minimal' thinking desteklemiyor — "
            "low, medium veya high kullanın"
        )


def _parse_providers(document: dict[str, Any], path: Path) -> dict[str, ProviderProfile]:
    raw_profiles = document.get("profiles")
    if not isinstance(raw_profiles, dict) or not raw_profiles:
        raise ConfigError(f"{path.name}: 'profiles' bölümü eksik veya boş")

    providers: dict[str, ProviderProfile] = {}
    for raw_name, raw_profile in raw_profiles.items():
        name = str(raw_name).strip()
        if not name:
            raise ConfigError(f"{path.name}: profilsiz (boş ad) kayıt var")
        if not isinstance(raw_profile, dict):
            raise ConfigError(f"{path.name}: '{name}' profili bir sözlük olmalı")
        payload = {**raw_profile, "name": name}
        try:
            profile = ProviderProfile.model_validate(payload)
        except ValidationError as exc:
            raise ConfigError(
                f"{path.name}: '{name}' profili geçersiz — {_format_validation_error(exc)}"
            ) from exc
        _validate_profile(profile)
        providers[name] = profile
    return providers


def _coerce_overrides(
    overrides: CliOverrides | Mapping[str, Any] | Any | None,
) -> CliOverrides:
    if overrides is None:
        return CliOverrides()
    if isinstance(overrides, CliOverrides):
        return overrides
    if isinstance(overrides, Mapping):
        data = dict(overrides)
        if "tag" in data and "tag_profile" not in data:
            data["tag_profile"] = data["tag"]
        if "write" in data and "write_profile" not in data:
            data["write_profile"] = data["write"]
        allowed = {key: data.get(key) for key in ("tag_profile", "write_profile")}
        return CliOverrides.model_validate(allowed)
    # typer/argparse benzeri nesne: yalnızca bilinen alanlar okunur
    return CliOverrides(
        tag_profile=getattr(overrides, "tag_profile", None),
        write_profile=getattr(overrides, "write_profile", None),
    )


def load_config(
    cli_overrides: CliOverrides | Mapping[str, Any] | Any | None = None,
    config_dir: str | Path = ".",
) -> Config:
    """`providers.yaml` + `config.yaml` + `.env` yükler ve doğrular.

    Args:
        cli_overrides: `--tag-profile` / `--write-profile` ezmeleri.
        config_dir: iki YAML ve `.env` dosyasının bulunduğu klasör.
    """
    base_dir = Path(config_dir).expanduser().resolve()
    providers_path = base_dir / "providers.yaml"
    config_path = base_dir / "config.yaml"
    env_path = base_dir / ".env"

    for path in (providers_path, config_path):
        if not path.is_file():
            raise ConfigError(f"{path.name} bulunamadı: {path}")

    providers = _parse_providers(_load_yaml(providers_path), providers_path)
    raw_config = _load_yaml(config_path)

    steps_raw = raw_config.get("steps")
    if not isinstance(steps_raw, dict):
        raise ConfigError(f"{config_path.name}: 'steps' bölümü eksik")
    step_names: dict[str, str] = {}
    for step in ("tag", "write"):
        node = steps_raw.get(step)
        if not isinstance(node, dict) or not str(node.get("profile") or "").strip():
            raise ConfigError(f"{config_path.name}: 'steps.{step}.profile' eksik")
        step_names[step] = str(node["profile"]).strip()

    overrides = _coerce_overrides(cli_overrides)
    if overrides.tag_profile:
        step_names["tag"] = overrides.tag_profile
    if overrides.write_profile:
        step_names["write"] = overrides.write_profile
    for step, profile_name in step_names.items():
        if profile_name not in providers:
            available = ", ".join(sorted(providers)) or "(yok)"
            flag = f"CLI --{step}-profile" if (
                (step == "tag" and overrides.tag_profile)
                or (step == "write" and overrides.write_profile)
            ) else f"steps.{step}.profile"
            raise ConfigError(
                f"{config_path.name}: {flag} = '{profile_name}' profili "
                f"providers.yaml'da yok — mevcut profiller: {available}"
            )

    raw_field_map = raw_config.get("field_map") or {}
    if not isinstance(raw_field_map, dict):
        raise ConfigError(f"{config_path.name}: 'field_map' bir sözlük olmalı")
    field_map = {**DEFAULT_FIELD_MAP, **{str(k): str(v) for k, v in raw_field_map.items()}}
    missing = [key for key in _REQUIRED_FIELD_MAP_KEYS if not field_map.get(key)]
    if missing:
        raise ConfigError(
            f"{config_path.name}: 'field_map' eksik alan(lar): {', '.join(missing)}"
        )

    raw_topic_aliases = raw_config.get("topic_aliases") or {}
    if not isinstance(raw_topic_aliases, dict):
        raise ConfigError(f"{config_path.name}: 'topic_aliases' bir sözlük olmalı")

    payload: dict[str, Any] = {
        "providers": providers,
        "steps": {
            "tag": {"profile": step_names["tag"]},
            "write": {"profile": step_names["write"]},
        },
        "field_map": field_map,
        "topic_aliases": raw_topic_aliases,
        "scoring": raw_config.get("scoring") or {},
        "bands": raw_config.get("bands") or [dict(band) for band in DEFAULT_BANDS],
        "tagging": raw_config.get("tagging") or {},
        "pdf": raw_config.get("pdf") or {},
        "config_dir": base_dir,
        "dotenv_path": env_path if env_path.exists() else None,
    }

    try:
        config = Config.model_validate(payload)
    except ValidationError as exc:
        raise ConfigError(
            f"{config_path.name}: geçersiz alan(lar) — {_format_validation_error(exc)}"
        ) from exc

    _load_dotenv(env_path)
    return config
