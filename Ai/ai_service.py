"""Shared, non-blocking Gemini client configuration."""
import os
from fastapi import HTTPException
from google import genai


class GeminiModel:
    def __init__(self, api_key):
        self.api_key = api_key
        self.name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

    async def generate_content(self, prompt):
        async with genai.Client(api_key=self.api_key).aio as client:
            return await client.models.generate_content(model=self.name, contents=prompt)


def configure_genai():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI service is not configured. Set GEMINI_API_KEY on the server.")
    return GeminiModel(api_key)
