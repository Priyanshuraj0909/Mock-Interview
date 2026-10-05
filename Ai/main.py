import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
import logging
from fastapi.middleware.cors import CORSMiddleware
from routers import tests
from routers import interview
from routers import auth

from database import connect_to_mongo, close_mongo_connection

app = FastAPI()
logger = logging.getLogger(__name__)


@app.exception_handler(PyMongoError)
async def database_error_handler(request: Request, exc: PyMongoError):
    # Driver messages can contain hostnames and credentials; do not return them.
    logger.error("Database request failed: %s", type(exc).__name__)
    return JSONResponse(
        status_code=503,
        headers={"Retry-After": "10"},
        content={
            "success": False,
            "message": "The account database is unavailable. Please try again shortly.",
        },
    )

# CORS configuration (Cross Origin REsource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(tests.router, prefix="/api")
app.include_router(interview.router, prefix="/api/interview", tags=["interview"])


@app.on_event("startup")
async def on_startup():
    if os.getenv("MONGODB_URI") or os.getenv("MONGO_URL"):
        await connect_to_mongo()


@app.on_event("shutdown")
async def on_shutdown():
    await close_mongo_connection()

@app.get("/")
def read_root():
    return {"message": "AI Mock Test API is running"}
