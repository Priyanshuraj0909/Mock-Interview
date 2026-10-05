import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import tests
from routers import interview
from routers import auth

from database import connect_to_mongo, close_mongo_connection

app = FastAPI()

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
