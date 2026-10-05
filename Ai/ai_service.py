"""Non-blocking Gemini generation with bounded retries and Groq failover."""
import asyncio
import logging
import os
from dataclasses import dataclass

import httpx
from fastapi import HTTPException
from google import genai
from google.genai import errors, types
from groq import AsyncGroq, APIError as GroqAPIError

logger = logging.getLogger(__name__)
TRANSIENT_CODES = {429, 500, 502, 503, 504}
DEFAULT_GROQ_MODELS = (
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
)
AI_REQUEST_TIMEOUT = 55
GROQ_MODEL_TIMEOUT = 10


@dataclass
class AIResponse:
    text: str


class GeminiModel:
    def __init__(self, api_key=None):
        self.api_key = api_key
        self.name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        self.groq_key = os.getenv("GROQ_API_KEY")
        configured = [name.strip() for name in os.getenv("GROQ_MODELS", "").split(",") if name.strip()]
        # Keep the existing single-model setting as the preferred first choice.
        preferred = os.getenv("GROQ_MODEL", "").strip()
        candidates = configured or ([preferred] if preferred else []) + list(DEFAULT_GROQ_MODELS)
        self.groq_models = list(dict.fromkeys(candidates))

    async def _generate_gemini(self, prompt):
        options = types.HttpOptions(
            timeout=15000,
            retry_options=types.HttpRetryOptions(attempts=1),
        )
        async with genai.Client(api_key=self.api_key, http_options=options).aio as client:
            return await client.models.generate_content(model=self.name, contents=prompt)

    async def _generate_groq(self, prompt):
        async with AsyncGroq(api_key=self.groq_key, timeout=float(GROQ_MODEL_TIMEOUT), max_retries=0) as client:
            for model_name in self.groq_models:
                try:
                    async with asyncio.timeout(GROQ_MODEL_TIMEOUT):
                        response = await client.chat.completions.create(
                            model=model_name,
                            messages=[{"role": "user", "content": prompt}],
                            temperature=0.5,
                            max_completion_tokens=4096,
                        )
                    text = response.choices[0].message.content if response.choices else None
                    if not text or not text.strip():
                        raise ValueError("Empty AI response")
                    return AIResponse(text=text)
                except (GroqAPIError, httpx.TransportError, ValueError, TimeoutError) as exc:
                    logger.warning("Groq model %s failed (%s)", model_name, type(exc).__name__)
                    # A rejected API key affects every model; do not repeat it.
                    if getattr(exc, "status_code", None) == 401:
                        break
        raise ValueError("Groq models exhausted")

    async def generate_content(self, prompt):
        try:
            async with asyncio.timeout(AI_REQUEST_TIMEOUT):
                return await self._generate_content(prompt)
        except TimeoutError:
            logger.warning("AI request time budget exhausted")
            raise self._unavailable()

    @staticmethod
    def _unavailable():
        return HTTPException(
            status_code=503,
            detail="AI is temporarily busy. Please try again in a moment.",
            headers={"Retry-After": "10"},
        )

    async def _generate_content(self, prompt):
        if self.api_key:
            for attempt in range(2):
                try:
                    response = await self._generate_gemini(prompt)
                    if not response.text or not response.text.strip():
                        raise ValueError("Empty AI response")
                    return response
                except (errors.APIError, httpx.TransportError, ValueError) as exc:
                    code = getattr(exc, "code", None)
                    transient = code in TRANSIENT_CODES or isinstance(exc, httpx.TransportError)
                    logger.warning("Gemini request failed (%s); attempt %d", type(exc).__name__, attempt + 1)
                    if transient and attempt == 0:
                        await asyncio.sleep(1)
                        continue
                    break
        if self.groq_key:
            try:
                return await self._generate_groq(prompt)
            except (GroqAPIError, httpx.TransportError, ValueError):
                logger.warning("Groq fallback request failed")
        raise self._unavailable()


def configure_genai():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key and not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="AI service is not configured. Set GEMINI_API_KEY or GROQ_API_KEY on the server.")
    return GeminiModel(api_key)
