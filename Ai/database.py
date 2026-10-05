import os
from typing import Optional

from fastapi import HTTPException
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError


load_dotenv()


class _MongoClientHolder:
    client: Optional[AsyncIOMotorClient] = None


_client_holder = _MongoClientHolder()


def _build_client() -> AsyncIOMotorClient:
    uri = os.getenv("MONGODB_URI") or os.getenv("MONGO_URL") or "mongodb://localhost:27017"
    return AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)


def get_client() -> AsyncIOMotorClient:
    if _client_holder.client is None:
        _client_holder.client = _build_client()
    return _client_holder.client


def get_database_name() -> str:
    return os.getenv("MONGODB_DB", "ai_mock_interview")


async def get_database():
    if not (os.getenv("MONGODB_URI") or os.getenv("MONGO_URL")):
        raise HTTPException(status_code=503, detail="Accounts are not configured. Set MONGODB_URI on the server.")
    return get_client()[get_database_name()]


async def connect_to_mongo():
    client = get_client()
    db = client[get_database_name()]
    try:
        await db["users"].create_index("email", unique=True)
    except PyMongoError:
        # Index might already exist or creation failed; log/ignore for now
        pass


async def close_mongo_connection():
    if _client_holder.client:
        _client_holder.client.close()
        _client_holder.client = None
