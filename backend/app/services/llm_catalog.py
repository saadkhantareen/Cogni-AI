"""Curated chat models for teacher BYOK (exam generation).

Embeddings, rerank, TTS, and safety-only models are intentionally omitted.
"""

from __future__ import annotations

from typing import Literal

LlmProviderChoice = Literal["platform", "vyceai", "openrouter", "groq"]

VYCEAI_BASE_URL = "https://vyceai.com/v1"
AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Platform / VyceAI chat models (OpenAI-compatible).
# Live GET /v1/models (2026-11-10) lists glm-5.3-flash and
# nemotron-3.5-super-vl. Claude Sonnet 4.6 is not in that list
# and returns 400 invalid_request on this key.
VYCEAI_CHAT_MODELS: list[dict[str, str]] = [
    {"id": "glm-5.3-flash", "label": "GLM 5.3 Flash"},
    {"id": "nemotron-3.5-super-vl", "label": "Nemotron 3.5 Super VL"},
]

# Agnes AI trial-priced Flash models (verified 2026-11-10: both return 200
# with json_object). Pro models are billed and are not listed here.
AGNES_CHAT_MODELS: list[dict[str, str]] = [
    {"id": "agnes-3.0-flash", "label": "Agnes 3.0 Flash"},
    {"id": "agnes-2.5-flash", "label": "Agnes 2.5 Flash"},
]

# Chat / instruct free models that can return exam JSON.
# Laguna S was removed from OpenRouter; Nemotron Lightning often returns empty.
OPENROUTER_FREE_CHAT_MODELS: list[dict[str, str]] = [
    {"id": "openrouter/free", "label": "Free Models Router"},
    {
        "id": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "label": "NVIDIA Nemotron 3 Ultra 550B (free)",
    },
    {"id": "google/gemma-4-26b-a4b-it:free", "label": "Google Gemma 4 26B A4B (free)"},
    {"id": "google/gemma-4-31b-it:free", "label": "Google Gemma 4 31B (free)"},
]

GROQ_FREE_CHAT_MODELS: list[dict[str, str]] = [
    {"id": "llama-3.1-8b-instant", "label": "Llama 3.1 8B Instant"},
    {"id": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B Versatile"},
    {"id": "openai/gpt-oss-20b", "label": "GPT-OSS 20B"},
    {"id": "gemma2-9b-it", "label": "Gemma 2 9B IT"},
]

_VYCEAI_IDS = frozenset(m["id"] for m in VYCEAI_CHAT_MODELS)
_AGNES_IDS = frozenset(m["id"] for m in AGNES_CHAT_MODELS)
_OPENROUTER_IDS = frozenset(m["id"] for m in OPENROUTER_FREE_CHAT_MODELS)
_GROQ_IDS = frozenset(m["id"] for m in GROQ_FREE_CHAT_MODELS)


def models_for_provider(provider: str) -> list[dict[str, str]]:
    p = (provider or "").strip().lower()
    if p == "vyceai":
        return list(VYCEAI_CHAT_MODELS)
    if p == "agnes":
        return list(AGNES_CHAT_MODELS)
    if p == "openrouter":
        return list(OPENROUTER_FREE_CHAT_MODELS)
    if p == "groq":
        return list(GROQ_FREE_CHAT_MODELS)
    return []


def fallback_models_for_provider(provider: str, primary_model: str) -> list[str]:
    """Ordered fallback models for a provider, excluding the primary.

    OpenRouter first tries the free router (it picks an available free
    model), then the Nemotron Ultra free model that was verified working
    on 2026-11-03, then any remaining catalog model. Gemma models are
    therefore not tried first after a Gemma 429, because both Gemma free
    models share the same upstream pool.
    """
    primary = (primary_model or "").strip()
    ordered: list[str] = []
    p = (provider or "").strip().lower()
    if p == "openrouter":
        preferred = ["openrouter/free", "nvidia/nemotron-3-ultra-550b-a55b:free"]
        ordered = preferred + [m["id"] for m in OPENROUTER_FREE_CHAT_MODELS]
    elif p == "groq":
        ordered = [m["id"] for m in GROQ_FREE_CHAT_MODELS]
    elif p == "vyceai":
        preferred = ["glm-5.3-flash", "nemotron-3.5-super-vl"]
        ordered = preferred + [m["id"] for m in VYCEAI_CHAT_MODELS]
    elif p == "agnes":
        preferred = ["agnes-3.0-flash", "agnes-2.5-flash"]
        ordered = preferred + [m["id"] for m in AGNES_CHAT_MODELS]
    seen: set[str] = set()
    out: list[str] = []
    for mid in ordered:
        if mid and mid != primary and mid not in seen:
            seen.add(mid)
            out.append(mid)
    return out


def is_allowed_model(provider: str, model: str) -> bool:
    p = (provider or "").strip().lower()
    mid = (model or "").strip()
    if not mid:
        return False
    if p == "vyceai":
        return mid in _VYCEAI_IDS
    if p == "agnes":
        return mid in _AGNES_IDS
    if p == "openrouter":
        return mid in _OPENROUTER_IDS
    if p == "groq":
        return mid in _GROQ_IDS
    return False


def base_url_for_provider(provider: str) -> str:
    p = (provider or "").strip().lower()
    if p == "vyceai":
        return VYCEAI_BASE_URL
    if p == "agnes":
        return AGNES_BASE_URL
    if p == "openrouter":
        return OPENROUTER_BASE_URL
    if p == "groq":
        return GROQ_BASE_URL
    return ""


def catalog_payload() -> dict:
    return {
        "providers": [
            {
                "id": "platform",
                "label": "Platform default (Agnes 3.0 Flash)",
                "models": [],
                "needs_api_key": False,
            },
            {
                "id": "vyceai",
                "label": "VyceAI",
                "models": VYCEAI_CHAT_MODELS,
                "needs_api_key": True,
                "key_help_url": "https://vyceai.com",
            },
            {
                "id": "openrouter",
                "label": "OpenRouter",
                "models": OPENROUTER_FREE_CHAT_MODELS,
                "needs_api_key": True,
                "key_help_url": "https://openrouter.ai/keys",
            },
            {
                "id": "groq",
                "label": "Groq",
                "models": GROQ_FREE_CHAT_MODELS,
                "needs_api_key": True,
                "key_help_url": "https://console.groq.com/keys",
            },
        ]
    }
