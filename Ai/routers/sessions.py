"""History, safe session retrieval, and conflict-aware answer autosaves."""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from database import get_database
from security import get_current_user
from session_store import owned_session, public_session, validate_answers, utcnow

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: dict[str, Annotated[str, Field(max_length=12000)]] = Field(max_length=50)
    revision: int = Field(ge=0)


@router.get("")
async def list_sessions(user_id=Depends(get_current_user), db=Depends(get_database),
                        limit: int = Query(default=30, ge=1, le=100)):
    cursor = db["sessions"].find({"userId": user_id}, {"params.resumeText": 0}).sort("createdAt", -1).limit(limit)
    sessions = []
    async for session in cursor:
        params = session["params"]
        score = session.get("result", {}).get("score")
        evaluations = session.get("evaluations", {})
        if session["kind"] == "interview" and evaluations:
            score = round(sum(e["score"] for e in evaluations.values()) / len(evaluations) * 10)
        sessions.append({"sessionId": session["_id"], "kind": session["kind"], "status": session["status"],
                         "title": params.get("subject") or params.get("interviewType", "Interview").replace("_", " "),
                         "createdAt": session["createdAt"], "score": score,
                         "answered": len(evaluations) if session["kind"] == "interview" else sum(bool(a.strip()) for a in session["answers"].values()),
                         "questionCount": len(session["questions"])})
    return {"sessions": sessions}


@router.get("/{session_id}")
async def get_session(session_id: str, user_id=Depends(get_current_user), db=Depends(get_database)):
    return public_session(await owned_session(db, session_id, user_id))


@router.patch("/{session_id}/answers")
async def save_answers(session_id: str, data: Draft, user_id=Depends(get_current_user), db=Depends(get_database)):
    session = await owned_session(db, session_id, user_id)
    validate_answers(session, data.answers)
    if any(data.answers.get(key) != session["answers"].get(key) for key in session["evaluations"]):
        raise HTTPException(422, "Graded answers cannot be edited. Start a new session to try again.")
    result = await db["sessions"].update_one(
        {"_id": session_id, "userId": user_id, "revision": data.revision, "status": "in_progress",
         "$or": [{"leaseUntil": {"$exists": False}}, {"leaseUntil": {"$lt": utcnow()}}]},
        {"$set": {"answers": data.answers, "updatedAt": utcnow()}, "$inc": {"revision": 1}},
    )
    if not result.matched_count:
        raise HTTPException(409, "This session changed in another tab. Reload it before continuing.")
    return {"revision": data.revision + 1, "saved": True}
