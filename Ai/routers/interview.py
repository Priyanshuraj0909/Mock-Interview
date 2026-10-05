from fastapi import APIRouter, HTTPException, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import google.generativeai as genai
import json
import re
import os
from enum import Enum

router = APIRouter()

# Pydantic models
class InterviewType(str, Enum):
    SOFTWARE_ENGINEER = "software_engineer"
    DATA_SCIENTIST = "data_scientist"
    FRONTEND_DEVELOPER = "frontend_developer"
    BACKEND_DEVELOPER = "backend_developer"
    FULLSTACK_DEVELOPER = "fullstack_developer"

class Question(BaseModel):
    id: int
    text: str
    
class Answer(BaseModel):
    questionId: int
    text: str

class FeedbackRequest(BaseModel):
    interviewType: InterviewType
    question: str
    answer: str

class FeedbackResponse(BaseModel):
    feedback: str
    score: int
    strengthPoints: List[str]
    improvementPoints: List[str]

class InterviewRequest(BaseModel):
    interviewType: InterviewType
    jobDescription: Optional[str] = None
    difficultyLevel: int = Field(default=3, ge=1, le=5)  # 1-5 scale

class InterviewResponse(BaseModel):
    questions: List[Question]

# Configure Gemini Model
def configure_genai():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI service is not configured. Set GEMINI_API_KEY on the server.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))

# Get model instance
def get_model():
    try:
        return configure_genai()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="AI service could not be initialized")

# Generate interview questions
@router.post("/generate-questions", response_model=InterviewResponse)
async def generate_questions(request: InterviewRequest, model = Depends(get_model)):
    try:
        # Construct prompt based on interview type and job description
        prompt = f"""
        Generate 5 technical interview questions for a {request.interviewType.replace('_', ' ')} position.
        Difficulty level: {request.difficultyLevel}/5.
        
        {f"Job Description: {request.jobDescription}" if request.jobDescription else ""}
        
        Return the response in valid JSON format like this:
        {{
            "questions": [
                {{"id": 1, "text": "question text here"}},
                ...
            ]
        }}
        
        Make sure questions are specific, technical, and appropriate for the role.
        """
        
        response = model.generate_content(prompt)
        
        # Extract JSON from the response
        json_match = re.search(r'```json\s*(.*?)\s*```', response.text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = response.text
            
        # Clean up any non-JSON content
        json_str = re.sub(r'[^{]*({.*})[^}]*', r'\1', json_str, flags=re.DOTALL)
        
        # Parse the JSON response
        parsed_response = json.loads(json_str)
        print(parsed_response)
        # Validate the response format
        if "questions" not in parsed_response or not isinstance(parsed_response["questions"], list):
            raise ValueError("Invalid response format from AI model")
            
        return parsed_response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating questions: {str(e)}")

# Provide feedback on an answer
@router.post("/evaluate-answer", response_model=FeedbackResponse)
async def evaluate_answer(request: FeedbackRequest, model = Depends(get_model)):
    try:
        # Construct prompt for evaluation
        prompt = f"""
        You are an expert interviewer for {request.interviewType.replace('_', ' ')} positions.
        
        Question: {request.question}
        
        Candidate's Answer: {request.answer}
        
        Evaluate the answer and provide:
        1. Overall feedback
        2. A score from 1-10
        3. 2-3 strength points (what was good)
        4. 2-3 areas for improvement
        
        Return the response in valid JSON format like this:
        {{
            "feedback": "overall feedback text",
            "score": 7,
            "strengthPoints": ["strength 1", "strength 2"],
            "improvementPoints": ["improvement 1", "improvement 2"]
        }}
        """
        
        response = model.generate_content(prompt)
        
        # Extract JSON from the response
        json_match = re.search(r'```json\s*(.*?)\s*```', response.text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = response.text
            
        # Clean up any non-JSON content
        json_str = re.sub(r'[^{]*({.*})[^}]*', r'\1', json_str, flags=re.DOTALL)
        
        # Parse the JSON response
        parsed_response = json.loads(json_str)
        
        # Validate the response format
        required_fields = ["feedback", "score", "strengthPoints", "improvementPoints"]
        for field in required_fields:
            if field not in parsed_response:
                raise ValueError(f"Missing required field in AI response: {field}")
                
        return parsed_response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error evaluating answer: {str(e)}")

# Health check endpoint
@router.get("/health")
async def health_check():
    return {"status": "ok"}

# Include router in app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)