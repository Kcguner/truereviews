"""Sağlayıcı kabul testleri — plan §9 kabul 3 (ağ yok).

Kapsam:

* `providers.example.yaml` içindeki her profil `config.yaml` üzerinden yüklenir
  ve `get_adapter` ile gerçek adaptör modülüne çözülür.
* `gemini`, `openai_compat` (GLM + DeepSeek) ve `opencode` profilleri
  `--tag-profile` / `--write-profile` ezmeleriyle config'ten seçilebilir.
* GLM ve DeepSeek ayrı ayrı seçilir; `base_url` değerleri doğrudur.
* Anahtar yoksa net hata: `GEMINI_API_KEY`, `GLM_API_KEY`, `DEEPSEEK_API_KEY`
  için "… tanımlı değil — .env dosyasına ekleyin" mesajı.
* `opencode` anahtar gerektirmez; PATH'te binary yoksa
  `OpencodeUnavailableError` fırlar ve diğer adaptörler etkilenmez.

Testler ağa çıkmaz; `opencode` alt süreci yalnızca binary aranırken durur.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from rapor.config import CliOverrides, Config, ConfigError, load_config
from rapor.providers import UnknownAdapterError, get_adapter
from rapor.providers.gemini import GeminiError
from rapor.providers.openai_compat import AdapterError
from rapor.providers.opencode import OpencodeUnavailableError

ROOT = Path(__file__).resolve().parents[1]

# Örnek dosyada tanımlı, ağ gerektirmeyen profil seti (opencode hariç).
OFFLINE_PROFILES = ("gemini-flash", "gemini-write", "glm", "deepseek", "mock")


@pytest.fixture()
def config_dir(tmp_path: Path) -> Path:
    """Örnek YAML'leri geçici config klasörüne kopyalar (gerçek dosyalar)."""
    target = tmp_path / "config"
    target.mkdir()
    shutil.copy(ROOT / "providers.example.yaml", target / "providers.yaml")
    shutil.copy(ROOT / "config.example.yaml", target / "config.yaml")
    return target


def _load(config_dir: Path, tag: str | None = None, write: str | None = None) -> Config:
    return load_config(
        CliOverrides(tag_profile=tag, write_profile=write), config_dir
    )


def _clear_keys(monkeypatch: pytest.MonkeyPatch, *names: str) -> None:
    for name in names:
        monkeypatch.delenv(name, raising=False)


# ---------------------------------------------------------------------------
# Kabul 3a — her örnek profil config'ten yüklenir ve adaptöre çözülür
# ---------------------------------------------------------------------------


def test_every_example_profile_resolves_to_an_adapter(config_dir: Path) -> None:
    config = _load(config_dir)
    # Örnek dosyadaki tüm profiller (mock ve opencode dahil) yüklendi.
    assert set(config.providers) == {
        "gemini-flash",
        "gemini-write",
        "glm",
        "deepseek",
        "opencode-main",
        "mock",
    }
    for name, profile in config.providers.items():
        adapter = get_adapter(profile.adapter)
        assert callable(getattr(adapter, "generate", None)), name
        assert profile.name == name


def test_unknown_adapter_is_rejected(config_dir: Path) -> None:
    with pytest.raises(UnknownAdapterError):
        get_adapter("bilinmeyen")


# ---------------------------------------------------------------------------
# Kabul 3b — gemini / openai_compat / opencode config'ten seçilebilir
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", ("gemini-flash", "gemini-write"))
def test_gemini_profile_selectable_from_config(config_dir: Path, name: str) -> None:
    config = _load(config_dir, tag=name, write=name)
    profile = config.profile_for_step("write")
    assert profile.name == name
    assert profile.adapter == "gemini"
    assert profile.model == "gemini-3.8-flash"
    assert get_adapter(profile.adapter).__name__ == "rapor.providers.gemini"


@pytest.mark.parametrize(
    ("name", "base_url"),
    (
        ("glm", "https://open.bigmodel.cn/api/paas/v4"),
        ("deepseek", "https://api.deepseek.com"),
    ),
)
def test_openai_compat_profiles_selectable_with_correct_base_url(
    config_dir: Path, name: str, base_url: str
) -> None:
    config = _load(config_dir, write=name)
    profile = config.profile_for_step("write")
    assert profile.name == name
    assert profile.adapter == "openai_compat"
    assert profile.base_url == base_url
    assert get_adapter(profile.adapter).__name__ == "rapor.providers.openai_compat"


def test_glm_and_deepseek_are_distinct_profiles(config_dir: Path) -> None:
    config = _load(config_dir)
    glm = config.profile("glm")
    deepseek = config.profile("deepseek")
    assert glm.base_url != deepseek.base_url
    assert glm.model != deepseek.model
    assert glm.api_key_env == "GLM_API_KEY"
    assert deepseek.api_key_env == "DEEPSEEK_API_KEY"


def test_opencode_profile_selectable_without_api_key(config_dir: Path) -> None:
    config = _load(config_dir, tag="opencode-main", write="opencode-main")
    profile = config.profile_for_step("write")
    assert profile.adapter == "opencode"
    assert profile.api_key_env is None
    # CLI'nin anahtar denetimi bu profili atlar: anahtar gerekmez.
    from rapor.cli import _check_keys

    _check_keys(config)  # ConfigError/typer.Exit yok


# ---------------------------------------------------------------------------
# Kabul 3c — anahtarsız net hata
# ---------------------------------------------------------------------------


def test_gemini_missing_key_message(config_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_keys(monkeypatch, "GEMINI_API_KEY")
    config = _load(config_dir, tag="gemini-flash", write="gemini-flash")

    with pytest.raises(ConfigError) as config_error:
        config.api_key("gemini-flash")
    assert "GEMINI_API_KEY tanımlı değil — .env dosyasına ekleyin" in str(
        config_error.value
    )

    adapter = get_adapter("gemini")
    with pytest.raises(GeminiError) as adapter_error:
        adapter.generate(
            config.profile("gemini-flash"),
            system="sistem",
            user="kullanıcı",
            schema=None,
            thinking="low",
            max_tokens=128,
            api_key=None,
        )
    assert "GEMINI_API_KEY tanımlı değil — .env dosyasına ekleyin" in str(
        adapter_error.value
    )


@pytest.mark.parametrize(
    ("profile_name", "env_name"),
    (("glm", "GLM_API_KEY"), ("deepseek", "DEEPSEEK_API_KEY")),
)
def test_openai_compat_missing_key_message(
    config_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    profile_name: str,
    env_name: str,
) -> None:
    _clear_keys(monkeypatch, env_name)
    config = _load(config_dir, write=profile_name)

    with pytest.raises(ConfigError) as config_error:
        config.api_key(profile_name)
    assert f"{env_name} tanımlı değil — .env dosyasına ekleyin" in str(
        config_error.value
    )

    adapter = get_adapter("openai_compat")
    with pytest.raises(AdapterError) as adapter_error:
        adapter.generate(
            config.profile(profile_name),
            system="sistem",
            user="kullanıcı",
            schema=None,
            thinking="medium",
            max_tokens=128,
            api_key=None,
        )
    assert f"{env_name} tanımlı değil — .env dosyasına ekleyin" in str(
        adapter_error.value
    )


def test_opencode_missing_binary_message(
    config_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = _load(config_dir, tag="opencode-main", write="opencode-main")
    profile = config.profile("opencode-main")

    # PATH gizlenir: `shutil.which("opencode")` bulamaz, alt süreç başlamaz.
    monkeypatch.setenv("PATH", "")
    adapter = get_adapter("opencode")
    with pytest.raises(OpencodeUnavailableError) as error:
        adapter.generate(
            profile,
            system="sistem",
            user="kullanıcı",
            schema=None,
            thinking="medium",
            max_tokens=128,
            api_key=None,  # opencode anahtar kullanmaz
        )
    assert "opencode bulunamadı" in str(error.value)
    assert "Diğer adaptörler" in str(error.value)


def test_opencode_failure_does_not_require_key_or_break_others(
    config_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """opencode binary'si yokken diğer adaptör modülleri çözülmeye devam eder."""
    _clear_keys(monkeypatch, "GEMINI_API_KEY", "GLM_API_KEY", "DEEPSEEK_API_KEY")
    config = _load(config_dir)
    monkeypatch.setenv("PATH", "")

    for name in OFFLINE_PROFILES:
        adapter = get_adapter(config.profile(name).adapter)
        assert callable(adapter.generate), name
