import asyncio
import json
import re

from app.core.config import settings


class LLMError(Exception):
    """Base error for any LLM failure. Mapped to HTTP 502 {"code": "LLM_FAILED"}."""


class LLMRequestError(LLMError):
    """The request to the provider failed, timed out, or errored."""


class LLMJSONError(LLMError):
    """The provider's response could not be parsed as JSON."""


def _extract_json(text: str) -> dict:
    """Parse the first JSON object found in `text`, stripping Markdown code
    fences first. Raises LLMJSONError if none is found or it doesn't parse."""
    text = (text or "").strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break
    raise LLMJSONError("The AI response did not contain a valid JSON object.")


class LLMClient:
    async def json_complete(
        self, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
    ) -> dict:
        """Send a system+user prompt and return a parsed JSON dict.
        Must return parsed JSON or raise LLMError."""
        raise NotImplementedError


class OpenAIClient(LLMClient):
    def __init__(self) -> None:
        from openai import AsyncOpenAI

        kwargs: dict = {"api_key": settings.LLM_API_KEY}
        if settings.LLM_BASE_URL:
            kwargs["base_url"] = settings.LLM_BASE_URL
        self._client = AsyncOpenAI(**kwargs)

    async def json_complete(
        self, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
    ) -> dict:
        try:
            response = await asyncio.wait_for(
                self._client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    max_tokens=max_tokens,
                    temperature=temperature,
                    response_format={"type": "json_object"},
                ),
                timeout=60,
            )
        except TimeoutError as exc:
            raise LLMRequestError("The OpenAI request timed out.") from exc
        except Exception as exc:
            raise LLMRequestError("The OpenAI request failed.") from exc
        content = response.choices[0].message.content or ""
        return _extract_json(content)


class AnthropicClient(LLMClient):
    def __init__(self) -> None:
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=settings.LLM_API_KEY)

    async def json_complete(
        self, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
    ) -> dict:
        json_system = (
            system
            + "\n\nRespond with a single JSON object only. No prose, no "
            "Markdown code fences, nothing before or after the object."
        )
        try:
            response = await asyncio.wait_for(
                self._client.messages.create(
                    model=settings.LLM_MODEL,
                    system=json_system,
                    messages=[{"role": "user", "content": user}],
                    max_tokens=max_tokens,
                    temperature=temperature,
                ),
                timeout=60,
            )
        except TimeoutError as exc:
            raise LLMRequestError("The Anthropic request timed out.") from exc
        except Exception as exc:
            raise LLMRequestError("The Anthropic request failed.") from exc
        content = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        return _extract_json(content)


class MockLLM(LLMClient):
    """Deterministic stand-in used when LLM_PROVIDER=mock and in all tests.
    Reads a JSON payload embedded in `user` (see prompts/exam_generation.py)
    rather than a free-text prompt, so it stays deterministic."""

    async def json_complete(
        self, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
    ) -> dict:
        payload = _extract_json(user)
        if payload.get("mode") == "grade":
            return self._grade(payload)
        return self._generate(payload)

    def _generate(self, payload: dict) -> dict:
        chunks = payload.get("chunks") or [
            {"idx": 0, "heading": "General", "text": "General course material."}
        ]
        counts = payload.get("counts") or {}
        clos = payload.get("clos") or ["CLO-1"]
        avoid = set(payload.get("avoid_texts") or [])
        preferred_topic = payload.get("preferred_topic")
        preferred_clo = payload.get("preferred_clo")
        bloom_cycle = ["Understand", "Analyze", "Apply", "Evaluate", "Remember"]

        questions = []
        n = 0
        for qtype, count in counts.items():
            for _ in range(count):
                chunk = chunks[n % len(chunks)]
                clo = preferred_clo or clos[n % len(clos)]
                bloom = bloom_cycle[n % len(bloom_cycle)]
                heading = preferred_topic or chunk.get("heading") or f"Topic {chunk['idx']}"
                question = self._build_question(qtype, bloom, heading, clo, chunk, n, chunks)
                if question["text"] not in avoid:
                    questions.append(question)
                n += 1
        return {"questions": questions}

    def _build_question(
        self, qtype: str, bloom: str, heading: str, clo: str, chunk: dict, n: int, chunks: list
    ) -> dict:
        base = {
            "type": qtype,
            "bloom": bloom,
            "topic": heading,
            "clo": clo,
            "source_chunk_idx": chunk["idx"],
        }
        snippet = _first_sentence(chunk["text"])
        if qtype == "MCQ":
            correct = snippet or f"A key idea from {heading}."
            other_chunks = [c for c in chunks if c["idx"] != chunk["idx"]] or chunks
            candidates = [
                _first_sentence(other_chunks[(n + 1) % len(other_chunks)]["text"]),
                _first_sentence(other_chunks[(n + 2) % len(other_chunks)]["text"]),
                f"A common misconception about {heading}.",
            ]
            seen = {correct}
            distractors = []
            for c in candidates:
                if c not in seen:
                    distractors.append(c)
                    seen.add(c)
            while len(distractors) < 3:
                distractors.append(f"An unrelated statement about {heading} #{len(distractors)}.")
            correct_index = n % 4
            options = [None] * 4
            options[correct_index] = correct
            j = 0
            for i in range(4):
                if options[i] is None:
                    options[i] = distractors[j]
                    j += 1
            base.update(
                {
                    "text": f'The material on {heading} states: "{snippet}" Which statement is correct?',
                    "options": options,
                    "answer_index": correct_index,
                }
            )
        else:
            keywords = _keywords_from_text(chunk["text"])
            verb = "explain" if qtype == "Short" else "critically evaluate and justify your position on"
            base.update(
                {
                    "text": f'The material on {heading} states: "{snippet}" {verb.capitalize()} the key idea behind this.',
                    "model_answer": snippet or f"{heading} is explained in the material.",
                    "keywords": keywords,
                }
            )
        return base

    def _grade(self, payload: dict) -> dict:
        answer = (payload.get("answer") or "").lower()
        keywords = payload.get("keywords") or []
        hit, miss = [], []
        for k in keywords:
            variants = [v.lower() for v in k.get("variants", [])]
            (hit if any(v in answer for v in variants) else miss).append(k.get("label"))
        coverage = len(hit) / len(keywords) if keywords else 0.0
        return {"score_pct": round(coverage * 100), "key_points_hit": hit, "key_points_missed": miss}


def _first_sentence(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)
    return parts[0][:200]


_STOPWORDS = {
    "which", "their", "there", "about", "these", "those", "where", "after",
    "before", "while", "because", "should", "would", "could", "other",
    "every", "through", "using", "between", "within", "without",
}


def _keywords_from_text(text: str) -> list[dict]:
    words = re.findall(r"[A-Za-z][A-Za-z\-]{4,}", text or "")
    picked: list[str] = []
    for w in words:
        lw = w.lower()
        if lw in _STOPWORDS or lw in picked:
            continue
        picked.append(lw)
        if len(picked) >= 6:
            break
    while len(picked) < 2:
        picked.append(f"concept{len(picked)}")
    return [{"label": w.capitalize(), "variants": [w]} for w in picked]


async def call_json(
    client: LLMClient, system: str, user: str, *, max_tokens: int = 2000, temperature: float = 0.4
) -> dict:
    """Wraps json_complete with one retry on invalid JSON, telling the model
    to return valid JSON only. Raises LLMError (mapped to 502 LLM_FAILED)."""
    try:
        return await client.json_complete(
            system, user, max_tokens=max_tokens, temperature=temperature
        )
    except LLMJSONError:
        retry_user = user + "\n\nReturn valid JSON only."
        try:
            return await client.json_complete(
                system, retry_user, max_tokens=max_tokens, temperature=temperature
            )
        except LLMError as exc:
            raise LLMError("The AI service returned invalid JSON twice in a row.") from exc


def get_llm_client() -> LLMClient:
    if settings.LLM_PROVIDER == "mock":
        return MockLLM()
    if settings.LLM_PROVIDER == "openai":
        return OpenAIClient()
    if settings.LLM_PROVIDER == "anthropic":
        return AnthropicClient()
    raise NotImplementedError(f"LLM_PROVIDER={settings.LLM_PROVIDER!r} is not implemented.")
