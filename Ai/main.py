import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
import logging
from fastapi.middleware.cors import CORSMiddleware
from routers import tests
from routers import interview
from routers import auth, sessions, resume, account, analytics

from database import connect_to_mongo, close_mongo_connection

@asynccontextmanager
async def lifespan(app):
    if os.getenv("MONGODB_URI") or os.getenv("MONGO_URL"):
        await connect_to_mongo()
    try:
        yield
    finally:
        await close_mongo_connection()


app = FastAPI(title="Mock Interview API", version="0.3.0", lifespan=lifespan)
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
            "message": "The practice database is unavailable. Please try again shortly.",
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
app.include_router(account.router)
app.include_router(analytics.router)
app.include_router(sessions.router)
app.include_router(resume.router)
app.include_router(tests.router, prefix="/api")
app.include_router(interview.router, prefix="/api/interview", tags=["interview"])


@app.get("/")
def read_root():
    return {"message": "AI Mock Test API is running"}


@app.middleware("http")
async def operational_metrics(request: Request, call_next):
    from time import perf_counter
    from telemetry import emit
    started = perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response
    finally:
        route = request.scope.get("route")
        emit("http_request", operation=getattr(route, "path", "unmatched"), status=status,
             success=status < 400, latencyMs=round((perf_counter() - started) * 1000))
