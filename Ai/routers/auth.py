from datetime import datetime, timedelta
import os
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field

from database import get_database


router = APIRouter(prefix="/api/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    purpose: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def _create_access_token(data: Dict[str, Any]) -> str:
    if not SECRET_KEY or len(SECRET_KEY) < 32:
        raise HTTPException(status_code=503, detail="Authentication is not configured. Set a JWT_SECRET_KEY of at least 32 characters.")
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _serialize_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(user.get("_id")),
        "name": user.get("name"),
        "email": user.get("email"),
        "purpose": user.get("purpose"),
    }


@router.post("/signup")
async def signup(payload: SignupRequest, db=Depends(get_database)):
    if not SECRET_KEY or len(SECRET_KEY) < 32:
        raise HTTPException(status_code=503, detail="Authentication is not configured on the server.")
    users_collection = db["users"]
    normalized_email = payload.email.lower()

    existing = await users_collection.find_one({"email": normalized_email})
    if existing:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "Email already registered"},
        )

    hashed_password = pwd_context.hash(payload.password)
    user_doc = {
        "name": payload.name.strip(),
        "email": normalized_email,
        "purpose": payload.purpose,
        "password_hash": hashed_password,
        "created_at": datetime.utcnow(),
    }

    result = await users_collection.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    token = _create_access_token({"sub": str(result.inserted_id), "email": normalized_email})

    return {
        "success": True,
        "message": "User registered successfully",
        "token": token,
        "user": _serialize_user(user_doc),
    }


@router.post("/login")
async def login(payload: LoginRequest, db=Depends(get_database)):
    if not SECRET_KEY or len(SECRET_KEY) < 32:
        raise HTTPException(status_code=503, detail="Authentication is not configured on the server.")
    users_collection = db["users"]
    normalized_email = payload.email.lower()

    user = await users_collection.find_one({"email": normalized_email})
    if not user or not pwd_context.verify(payload.password, user.get("password_hash", "")):
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "message": "Invalid email or password"},
        )

    token = _create_access_token({"sub": str(user["_id"]), "email": normalized_email})

    return {
        "success": True,
        "message": "Login successful",
        "token": token,
        "user": _serialize_user(user),
    }
