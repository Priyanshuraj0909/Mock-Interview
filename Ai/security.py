"""Authentication and database-backed limits shared by every practice workflow."""
from datetime import datetime, timedelta, timezone
import os

from bson import ObjectId
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pymongo import ReturnDocument

from database import get_database

bearer = HTTPBearer(auto_error=False)


def require_bearer(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if credentials is None:
        raise HTTPException(401, "Please sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    return credentials


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(require_bearer), db=Depends(get_database)):
    from routers import auth
    unauthorized = HTTPException(401, "Please sign in again to continue.", headers={"WWW-Authenticate": "Bearer"})
    if not auth.SECRET_KEY or len(auth.SECRET_KEY) < 32:
        raise HTTPException(503, "Authentication is not configured on the server.")
    if auth.ALGORITHM not in {"HS256", "HS384", "HS512"}:
        raise HTTPException(503, "Authentication algorithm is not supported.")
    try:
        claims = jwt.decode(credentials.credentials, auth.SECRET_KEY, algorithms=[auth.ALGORITHM],
                            options={"require_exp": True, "require_sub": True})
        subject = claims["sub"]
        if not ObjectId.is_valid(subject):
            raise unauthorized
    except (JWTError, ValueError, TypeError):
        raise unauthorized from None
    user = await db["users"].find_one({"_id": ObjectId(subject)})
    if not user:
        raise unauthorized
    return str(user["_id"])


async def require_ai_quota(user_id=Depends(get_current_user), db=Depends(get_database)):
    """Atomic fixed-window counter works across serverless instances."""
    now = datetime.now(timezone.utc)
    minute = int(now.timestamp()) // 60
    counter = await db["rate_limits"].find_one_and_update(
        {"_id": f"{user_id}:{minute}"},
        {"$inc": {"count": 1}, "$setOnInsert": {"expiresAt": now + timedelta(minutes=2)}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    limit = max(1, int(os.getenv("AI_REQUESTS_PER_MINUTE", "20")))
    if counter["count"] > limit:
        raise HTTPException(429, "You've reached the practice request limit. Please wait a moment.",
                            headers={"Retry-After": str(60 - now.second)})
    return user_id
