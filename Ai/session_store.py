"""Private session persistence, optimistic autosaves, and expiring grading leases."""
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from fastapi import HTTPException
from pymongo import ReturnDocument


def utcnow():
    return datetime.now(timezone.utc)


async def create_session(db, user_id, kind, params, questions):
    now = utcnow()
    session = {"_id": str(uuid4()), "userId": user_id, "kind": kind, "params": params,
               "questions": questions, "answers": {}, "evaluations": {}, "status": "in_progress",
               "revision": 0, "createdAt": now, "updatedAt": now}
    if kind == "test":
        session["deadlineAt"] = now + timedelta(minutes=params["timeLimit"])
    await db["sessions"].insert_one(session)
    return session


async def owned_session(db, session_id, user_id, kind=None):
    query = {"_id": session_id, "userId": user_id}
    if kind:
        query["kind"] = kind
    session = await db["sessions"].find_one(query)
    if not session:
        raise HTTPException(404, "Practice session not found.")
    return session


def public_session(session):
    result = {key: value for key, value in session.items()
              if key not in {"_id", "userId", "leaseId", "leaseUntil"}}
    result["sessionId"] = session["_id"]
    # References and resume text stay private. References are returned only in graded results.
    result["questions"] = [{k: v for k, v in q.items() if k != "correctAnswer"} for q in session["questions"]]
    result["params"] = {k: v for k, v in session["params"].items() if k != "resumeText"}
    return result


def validate_answers(session, answers):
    ids = {str(q["id"]) for q in session["questions"]}
    if not set(answers).issubset(ids):
        raise HTTPException(422, "Answers contain an unknown question.")


async def acquire_lease(db, session):
    lease_id = str(uuid4())
    now = utcnow()
    locked = await db["sessions"].find_one_and_update(
        {"_id": session["_id"], "userId": session["userId"], "revision": session["revision"],
         "status": "in_progress", "$or": [{"leaseUntil": {"$exists": False}}, {"leaseUntil": {"$lt": now}}]},
        {"$set": {"leaseId": lease_id, "leaseUntil": now + timedelta(seconds=90)}},
        return_document=ReturnDocument.AFTER,
    )
    if not locked:
        raise HTTPException(409, "This session changed or is processing. Reload it before trying again.", headers={"Retry-After": "3"})
    return lease_id


async def save_with_lease(db, session, lease_id, changes):
    result = await db["sessions"].update_one(
        {"_id": session["_id"], "userId": session["userId"], "leaseId": lease_id, "revision": session["revision"]},
        {"$set": {**changes, "updatedAt": utcnow()}, "$inc": {"revision": 1},
         "$unset": {"leaseId": "", "leaseUntil": ""}},
    )
    if not result.matched_count:
        raise HTTPException(409, "The session changed while processing. Reload to see the latest result.")


async def release_lease(db, session_id, lease_id):
    await db["sessions"].update_one({"_id": session_id, "leaseId": lease_id},
                                     {"$unset": {"leaseId": "", "leaseUntil": ""}})
