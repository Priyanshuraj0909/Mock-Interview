"""Opt-in structured operational metrics. Never accept prompt or answer fields."""
import json
import logging
import os

logger = logging.getLogger("practice.metrics")


def emit(event, **fields):
    if os.getenv("AI_TELEMETRY_ENABLED", "false").lower() != "true":
        return
    allowed = {"provider", "model", "latencyMs", "inputTokens", "outputTokens", "fallback", "success", "status", "operation"}
    logger.warning(json.dumps({"event": event, **{key: value for key, value in fields.items() if key in allowed}}, separators=(",", ":")))
