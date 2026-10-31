"""Reject malformed model output instead of inventing placeholder answers."""
import json
import re
from fastapi import HTTPException


def parse_ai_json(text):
    try:
        text = text.strip()
        fenced = re.fullmatch(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        return json.loads(fenced.group(1) if fenced else text)
    except (ValueError, AttributeError):
        raise invalid_ai_response() from None


def invalid_ai_response():
    return HTTPException(503, "The AI returned an incomplete response. Please retry; saved progress is available.",
                         headers={"Retry-After": "10"})
