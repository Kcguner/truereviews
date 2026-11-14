"""`rapor/config.py` testleri: örnek YAML'lar, doğrulama, CLI ezmeleri, anahtar çözümleme."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
import yaml

from rapor.config import CliOverrides, ConfigError, load_config

ROOT = Path(__file__).resolve().parents[1]


def load_example(name: str) -> dict:
    return yaml.safe_load((ROOT / name).read_text(encoding="utf-8"))


def prepare_config_dir(tmp_path: Path, providers=None, config=None, env_text: str | None = None) -> Path:
    providers = copy.deepcopy(providers) if providers is not None else load_example("providers.example.yaml")
    config = copy.deepcopy(config) if config is not None else load_example("config.example.yaml")
    if providers is not False:
        (tmp_path / "providers.yaml").write_text(
            yaml.safe_dump(providers, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )
    if config is not False:
        (tmp_path / "config.yaml").write_text(
            yaml.safe_dump(config, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )
    if env_text is not None:
        (tmp_path / ".env").write_text(env_text, encoding="utf-8")
    return tmp_path


# --- Mutlu yol ------------------------------------------------------------


def test_example_files_load(tmp_path):
    config = load_config(None, prepare_config_dir(tmp_path))

    assert config.steps.tag.profile == "gemini-flash"
    assert config.steps.write.profile == "gemini-write"
    assert set(config.providers) == {
        "gemini-flash",
        "gemini-write",
        "glm",
        "deepseek",
        "opencode-main",
        "mock",
    }
    assert config.providers["glm"].adapter == "openai_compat"
    assert config.providers["glm"].base_url == "https://open.bigmodel.cn/api/paas/v4"
    assert config.providers["deepseek"].model == "deepseek-flash"
    assert config.providers["gemini-write"].thinking == "medium"
    assert config.providers["gemini-flash"].pricing.input == 0.30
    assert config.tagging.group_size == 20
    assert config.tagging.max_group_retries == 2
    assert config.pdf.footer.owner_name == "Kaan Can Güner"
    assert config.pdf.footer.signature == "<KCG />"
    assert config.pdf.footer.cta_enabled is True
    assert config.topic_aliases["servis"] == ["garson", "servis hızı"]


def test_field_map_matches_apify_names(tmp_path):
    config = load_config(None, prepare_config_dir(tmp_path))
    assert config.field_map["text"] == "text"
    assert config.field_map["date"] == "publishedAtDate"
    assert config.field_map["id"] == "reviewId"
    assert config.field_map["owner_response"] == "responseFromOwnerText"
    assert config.field_map["detailed_ratings"] == "reviewDetailedRating"
    assert config.field_map["total_score"] == "totalScore"


def test_field_map_defaults_when_omitted(tmp_path):
    raw = load_example("config.example.yaml")
    raw.pop("field_map")
    config = load_config(None, prepare_config_dir(tmp_path, config=raw))
    assert config.field_map["date"] == "publishedAtDate"
    assert config.field_map["reviews_count"] == "reviewsCount"


def test_field_map_accepted_by_normalize(tmp_path):
    """config.field_map anahtarları `normalize.py`'ın kabul ettiği kümede olmalı."""
    from rapor.normalize import DEFAULT_FIELD_MAP as NORMALIZE_FIELD_MAP

    config = load_config(None, prepare_config_dir(tmp_path))
    assert set(config.field_map) == set(NORMALIZE_FIELD_MAP)
    for logical, source in config.field_map.items():
        assert source == NORMALIZE_FIELD_MAP[logical]


def test_bands_and_weights(tmp_path):
    config = load_config(None, prepare_config_dir(tmp_path))
    assert config.band_for(0).name == "zayif"
    assert config.band_for(49).label == "Zayıf"
    assert config.band_for(50).name == "orta"
    assert config.band_for(82).name == "iyi"
    assert config.band_for(84.6).name == "iyi"  # tamsayı sınıra iner
    assert config.band_for(100).name == "cok_iyi"
    assert config.band_for(140).name == "cok_iyi"  # kırpılır
    weights = config.scoring.weights
    assert (weights.average, weights.positive_ratio, weights.recent) == (0.60, 0.25, 0.15)


# --- Eksik dosya / alan ---------------------------------------------------


def test_missing_providers_file(tmp_path):
    prepare_config_dir(tmp_path, providers=False)
    with pytest.raises(ConfigError, match="providers.yaml bulunamadı"):
        load_config(None, tmp_path)


def test_missing_config_file(tmp_path):
    prepare_config_dir(tmp_path, config=False)
    with pytest.raises(ConfigError, match="config.yaml bulunamadı"):
        load_config(None, tmp_path)


def test_missing_steps_section(tmp_path):
    raw = load_example("config.example.yaml")
    raw.pop("steps")
    with pytest.raises(ConfigError, match="'steps' bölümü eksik"):
        load_config(None, prepare_config_dir(tmp_path, config=raw))


def test_missing_step_profile_names_field(tmp_path):
    raw = load_example("config.example.yaml")
    del raw["steps"]["tag"]["profile"]
    with pytest.raises(ConfigError, match=r"steps\.tag\.profile"):
        load_config(None, prepare_config_dir(tmp_path, config=raw))


def test_missing_provider_field_names_field(tmp_path):
    providers = load_example("providers.example.yaml")
    del providers["profiles"]["glm"]["model"]
    with pytest.raises(ConfigError, match="model"):
        load_config(None, prepare_config_dir(tmp_path, providers=providers))


def test_unknown_step_profile(tmp_path):
    raw = load_example("config.example.yaml")
    raw["steps"]["write"]["profile"] = "yok-boyle-profil"
    with pytest.raises(ConfigError, match="yok-boyle-profil"):
        load_config(None, prepare_config_dir(tmp_path, config=raw))


def test_scores_weights_must_sum_to_one(tmp_path):
    raw = load_example("config.example.yaml")
    raw["scoring"]["weights"]["average"] = 0.90
    with pytest.raises(ConfigError, match="ağırlık toplamı"):
        load_config(None, prepare_config_dir(tmp_path, config=raw))


# --- Adaptör / thinking kuralları ----------------------------------------


def test_gemini_flash_minimal_thinking_rejected(tmp_path):
    providers = load_example("providers.example.yaml")
    providers["profiles"]["gemini-flash"]["thinking"] = "minimal"
    with pytest.raises(ConfigError, match="minimal"):
        load_config(None, prepare_config_dir(tmp_path, providers=providers))


def test_gemini_minimal_allowed_for_other_models(tmp_path):
    providers = load_example("providers.example.yaml")
    providers["profiles"]["gemini-flash"]["model"] = "gemini-4.0-flash"
    providers["profiles"]["gemini-flash"]["thinking"] = "minimal"
    config = load_config(None, prepare_config_dir(tmp_path, providers=providers))
    assert config.providers["gemini-flash"].thinking == "minimal"


def test_unknown_adapter_rejected(tmp_path):
    providers = load_example("providers.example.yaml")
    providers["profiles"]["glm"]["adapter"] = "ollama"
    with pytest.raises(ConfigError, match="bilinmeyen adaptör"):
        load_config(None, prepare_config_dir(tmp_path, providers=providers))


def test_openai_compat_requires_base_url(tmp_path):
    providers = load_example("providers.example.yaml")
    providers["profiles"]["deepseek"].pop("base_url")
    with pytest.raises(ConfigError, match="base_url zorunlu"):
        load_config(None, prepare_config_dir(tmp_path, providers=providers))


# --- CLI ezmeleri ---------------------------------------------------------


def test_cli_overrides_model(tmp_path):
    config = load_config(
        CliOverrides(tag_profile="glm", write_profile="deepseek"),
        prepare_config_dir(tmp_path),
    )
    assert config.steps.tag.profile == "glm"
    assert config.steps.write.profile == "deepseek"
    assert config.profile_for_step("tag").name == "glm"
    assert config.profile_for_step("write").name == "deepseek"


def test_cli_overrides_accept_mapping(tmp_path):
    config = load_config({"tag_profile": "mock"}, prepare_config_dir(tmp_path))
    assert config.steps.tag.profile == "mock"
    assert config.steps.write.profile == "gemini-write"


def test_cli_override_unknown_profile(tmp_path):
    with pytest.raises(ConfigError, match="--tag-profile"):
        load_config(
            CliOverrides(tag_profile="ghost"), prepare_config_dir(tmp_path)
        )


# --- API anahtarı çözümleme ----------------------------------------------


def test_api_key_from_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "g-key")
    config = load_config(None, prepare_config_dir(tmp_path))
    assert config.api_key("gemini-flash") == "g-key"
    assert config.api_key_for(config.providers["gemini-write"]) == "g-key"


def test_api_key_missing_message(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    config = load_config(None, prepare_config_dir(tmp_path))
    with pytest.raises(
        ConfigError, match="GEMINI_API_KEY tanımlı değil — .env dosyasına ekleyin"
    ):
        config.api_key("gemini-flash")


def test_mock_profile_needs_no_key(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    config = load_config(None, prepare_config_dir(tmp_path))
    assert config.api_key("mock") is None


def test_api_key_from_dotenv(tmp_path, monkeypatch):
    monkeypatch.delenv("GLM_API_KEY", raising=False)
    prepare_config_dir(tmp_path, env_text="GLM_API_KEY=dotenv-key\n")
    config = load_config(None, tmp_path)
    assert config.dotenv_path == tmp_path / ".env"
    assert config.api_key("glm") == "dotenv-key"


def test_missing_api_key_env_field(tmp_path):
    providers = load_example("providers.example.yaml")
    del providers["profiles"]["deepseek"]["api_key_env"]
    config = load_config(None, prepare_config_dir(tmp_path, providers=providers))
    with pytest.raises(ConfigError, match="api_key_env tanımlı değil"):
        config.api_key("deepseek")
