"""Sağlayıcı adaptör kaydı (tembel import) ve tek arayüz.

`get_adapter("gemini")` → `rapor.providers.gemini` modülü. Modül ancak
istenince import edilir; böylece kullanılmayan SDK'lar (google-genai, openai)
yüklenmez. Bilinmeyen ad net hata verir.
"""

from __future__ import annotations

import importlib
from types import ModuleType

__all__ = [
    "ADAPTERS",
    "UnknownAdapterError",
    "generate_json",
    "get_adapter",
]

# Adlandırılmış profil `adapter` alanı → modül yolu.
ADAPTERS: dict[str, str] = {
    "gemini": "rapor.providers.gemini",
    "openai_compat": "rapor.providers.openai_compat",
    "opencode": "rapor.providers.opencode",
    "mock": "rapor.providers.mock",
}


class UnknownAdapterError(ValueError):
    """`providers.yaml` bilinmeyen bir adaptör adı taşıyor."""


def get_adapter(name: str) -> ModuleType:
    """Adaptör modülünü döner. Bilinmeyen ad → `UnknownAdapterError`."""
    key = str(name or "").strip().lower()
    module_path = ADAPTERS.get(key)
    if module_path is None:
        known = ", ".join(sorted(ADAPTERS))
        raise UnknownAdapterError(
            f"bilinmeyen adaptör: '{name}' — bilinen adaptörler: {known}"
        )
    return importlib.import_module(module_path)


# `base.generate_json` paketten de erişilebilir. Import sırası önemli:
# `get_adapter` yukarıda tanımlı, `base` onu bu modülden alır.
from .base import AdapterResult, AdapterUsage, LLMResult, generate_json  # noqa: E402

__all__ += ["AdapterResult", "AdapterUsage", "LLMResult"]
