"""Opaque rotating refresh tokens and bounded authentication attempts."""
import hashlib
import os
import secrets
from datetime import timedelta
from fastapi import HTTPException
from pymongo import ReturnDocument
from session_store import utcnow

COOKIE = "practice_refresh"

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

async def auth_throttle(db, request, operation):
    now = utcnow()
    address = request.client.host if request.client else "unknown"
    # Vercel sets this header; outside Vercel never trust forwarded client headers.
    if os.getenv("VERCEL"):
        address = request.headers.get("x-vercel-forwarded-for", address).split(",")[0].strip()
    key = digest(address)
    row = await db["rate_limits"].find_one_and_update(
        {"_id": f"auth:{operation}:{key}:{int(now.timestamp()) // 60}"},
        {"$inc": {"count": 1}, "$setOnInsert": {"expiresAt": now + timedelta(minutes=2)}},
        upsert=True, return_document=ReturnDocument.AFTER)
    if row["count"] > 10:
        raise HTTPException(429, "Too many attempts. Try again in a minute.", headers={"Retry-After": "60"})

async def issue_refresh_cookie(db, response, user):
    token = secrets.token_urlsafe(48)
    await db["refresh_tokens"].insert_one({"_id": digest(token), "userId": str(user["_id"]),
        "version": user.get("tokenVersion", 0), "expiresAt": utcnow() + timedelta(days=30)})
    current = await db["users"].find_one({"_id": user["_id"]})
    if not current or current.get("deleting") or current.get("tokenVersion", 0) != user.get("tokenVersion", 0):
        await db["refresh_tokens"].delete_many({"_id": digest(token)})
        raise HTTPException(401, "Please sign in again.")
    response.set_cookie(COOKIE, token, httponly=True, secure=bool(os.getenv("VERCEL")),
                        samesite="strict", path="/api/auth", max_age=30 * 86400)
