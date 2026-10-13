from abc import ABC, abstractmethod

from app.core.config import settings


class LLMClient(ABC):
    @abstractmethod
    async def json_complete(self, system: str, user: str, schema_hint: dict) -> dict:
        """Send a system+user prompt and return a parsed JSON dict matching schema_hint."""


class MockLLM(LLMClient):
    async def json_complete(self, system: str, user: str, schema_hint: dict) -> dict:
        return {}


def get_llm_client() -> LLMClient:
    if settings.LLM_PROVIDER == "mock":
        return MockLLM()
    raise NotImplementedError(f"LLM_PROVIDER={settings.LLM_PROVIDER!r} is not implemented yet")
