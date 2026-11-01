"""Bounded personal trends; repeated questions count once per topic."""
from collections import defaultdict
from fastapi import APIRouter, Depends
from database import get_database
from security import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("")
async def analytics(user_id=Depends(get_current_user), db=Depends(get_database)):
    topics = defaultdict(dict)
    trends = []
    duplicates = 0
    scanned = 0
    cursor = db["sessions"].find({"userId": user_id}, {"params.resumeText": 0, "answers": 0, "questions.correctAnswer": 0}).sort("createdAt", -1).limit(100)
    async for session in cursor:
        scanned += 1
        params = session["params"]
        group = params.get("subject") or params.get("interviewType", "Interview").replace("_", " ")
        difficulty = str(params.get("difficulty", params.get("difficultyLevel", "unspecified")))
        key = f'{session["kind"]}: {group} · {difficulty}'
        scores = []
        if session["kind"] == "interview":
            for question in session["questions"]:
                evaluation = session.get("evaluations", {}).get(str(question["id"]))
                if evaluation is None or question.get("parentId"):
                    continue
                score = evaluation["score"] * 10
                topic = question.get("topic", group).strip().casefold()
                fingerprint = ' '.join(question.get("text", question.get("question", "")).casefold().split())
                evidence = topics[(key, topic)]
                if fingerprint in evidence:
                    duplicates += 1
                else:
                    evidence[fingerprint] = score
                scores.append(score)
        elif session.get("result"):
            scores = [session["result"]["score"]]
        if scores:
            trends.append({"sessionId": session["_id"], "group": key, "date": session["createdAt"],
                           "score": round(sum(scores) / len(scores)), "completed": session["status"] == "completed"})
    rows = [{"group": group, "topic": topic, "score": round(sum(values.values()) / len(values)),
             "uniqueQuestions": len(values), "suggestion": "Practice this topic next" if sum(values.values()) / len(values) < 70 else "Try a harder question"}
            for (group, topic), values in topics.items()]
    rows.sort(key=lambda item: (item["score"], item["topic"]))
    return {"sessionsScanned": scanned, "limit": 100, "repeatedQuestionsExcluded": duplicates,
            "topics": rows, "trends": list(reversed(trends)),
            "note": "Compare the same practice type, subject and difficulty. Topic evidence uses the latest score for each distinct question; follow-ups are excluded. Scores are AI judgments, not a measure of mastery."}
