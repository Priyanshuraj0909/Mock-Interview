"""Private account controls and recovery without an external mail dependency."""
import asyncio
import secrets
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, EmailStr, field_validator
from database import get_database
from security import get_current_user
from session_store import utcnow
from account_sessions import COOKIE, digest, issue_refresh_cookie, auth_throttle
from routers.auth import SignupRequest, pwd_context, _create_access_token

router = APIRouter(prefix="/api/auth", tags=["account"])

class PasswordCheck(BaseModel):
    password: str = Field(min_length=1, max_length=72)
    _password_bytes = field_validator("password")(SignupRequest.password_byte_limit)

class ResetPassword(BaseModel):
    email: EmailStr
    recoveryCode: str = Field(min_length=20, max_length=150)
    password: str = Field(min_length=8, max_length=72)

async def verify_password(db, user_id, password):
    user = await db["users"].find_one({"_id": ObjectId(user_id)})
    if not user or not await asyncio.to_thread(pwd_context.verify, password, user.get("password_hash", "")):
        raise HTTPException(401, "Password is incorrect.")
    return user

@router.post("/refresh")
async def refresh(request: Request, response: Response, db=Depends(get_database)):
    await auth_throttle(db, request, "refresh")
    token = request.cookies.get(COOKIE, "")
    row = await db["refresh_tokens"].find_one_and_delete({"_id": digest(token)})
    if not row or row["expiresAt"] <= utcnow():
        raise HTTPException(401, "Please sign in again.")
    user = await db["users"].find_one({"_id": ObjectId(row["userId"])})
    if not user or user.get("deleting") or row["version"] != user.get("tokenVersion", 0):
        raise HTTPException(401, "Please sign in again.")
    await issue_refresh_cookie(db, response, user)
    return {"token": _create_access_token({"sub": str(user["_id"]), "ver": user.get("tokenVersion", 0)})}

@router.post("/logout")
async def logout(request: Request, response: Response, db=Depends(get_database)):
    await db["refresh_tokens"].delete_many({"_id": digest(request.cookies.get(COOKIE, ""))})
    response.delete_cookie(COOKIE, path="/api/auth")
    return {"success": True}

@router.post("/recovery-code")
async def recovery_code(payload: PasswordCheck, request: Request, user_id=Depends(get_current_user), db=Depends(get_database)):
    await auth_throttle(db, request, "recovery")
    await verify_password(db, user_id, payload.password)
    code = secrets.token_urlsafe(32)
    await db["users"].update_one({"_id": ObjectId(user_id)}, {"$set": {"recoveryHash": digest(code)}})
    return {"recoveryCode": code}

@router.post("/reset-password")
async def reset_password(payload: ResetPassword, request: Request, db=Depends(get_database)):
    await auth_throttle(db, request, "reset")
    if len(payload.password.encode("utf-8")) > 72:
        raise HTTPException(422, "Password must be at most 72 UTF-8 bytes.")
    hashed = await asyncio.to_thread(pwd_context.hash, payload.password)
    user = await db["users"].find_one_and_update(
        {"email": payload.email.lower(), "recoveryHash": digest(payload.recoveryCode)},
        {"$set": {"password_hash": hashed}, "$unset": {"recoveryHash": ""}, "$inc": {"tokenVersion": 1}})
    if not user:
        raise HTTPException(400, "Email or recovery code is invalid.")
    await db["refresh_tokens"].delete_many({"userId": str(user["_id"])})
    return {"success": True}

@router.post("/delete-account")
async def delete_account(payload: PasswordCheck, request: Request, response: Response,
                         user_id=Depends(get_current_user), db=Depends(get_database)):
    await auth_throttle(db, request, "delete")
    await verify_password(db, user_id, payload.password)
    # Invalidate authentication first; keep a retryable tombstone if cleanup fails.
    await db["users"].update_one({"_id": ObjectId(user_id)}, {"$set": {"deleting": True}, "$inc": {"tokenVersion": 1}})
    await db["sessions"].delete_many({"userId": user_id})
    await db["refresh_tokens"].delete_many({"userId": user_id})
    await db["users"].delete_many({"_id": ObjectId(user_id)})
    response.delete_cookie(COOKIE, path="/api/auth")
    return {"success": True}
