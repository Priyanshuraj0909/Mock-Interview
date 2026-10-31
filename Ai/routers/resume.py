"""Extract text from a bounded upload; original files are never persisted."""
import asyncio
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Request
from pypdf import PdfReader

from security import require_ai_quota

router = APIRouter(prefix="/api/resume", tags=["resume"])
MAX_UPLOAD_BYTES = 2 * 1024 * 1024


def extract_pdf(data):
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise HTTPException(422, "Please upload an unencrypted PDF.")
        if len(reader.pages) > 10:
            raise HTTPException(422, "Please upload a resume with at most 10 pages.")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, "This PDF could not be read. Try pasting your resume text instead.") from None
    return text


@router.post("/extract")
async def extract_resume(request: Request, user_id=Depends(require_ai_quota)):
    content_type = request.headers.get("content-type", "").split(";")[0]
    if content_type not in {"application/pdf", "text/plain"}:
        raise HTTPException(415, "Upload a PDF or plain-text resume.")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Resume files must be 2 MB or smaller.")
    if content_type == "application/pdf":
        if not data.startswith(b"%PDF-"):
            raise HTTPException(422, "This file is not a PDF.")
        text = await asyncio.to_thread(extract_pdf, bytes(data))
    else:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(422, "Plain-text resumes must use UTF-8 encoding.") from None
    text = text.strip()
    if not text:
        raise HTTPException(422, "No readable text was found. Paste your resume text or use a text-based PDF.")
    if len(text) > 20000:
        raise HTTPException(422, "Resume text must contain at most 20,000 characters.")
    return {"text": text, "characters": len(text)}
