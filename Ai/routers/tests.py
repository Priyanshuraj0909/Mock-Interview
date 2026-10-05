from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from ai_service import configure_genai
import json
import re
import os

router = APIRouter()

# Configure Gemini Model

# Dependency for getting the model
def get_model():
    return configure_genai()

class TestParams(BaseModel):
    purpose: str
    subject: str
    difficulty: str
    testType: str
    timeLimit: int = Field(ge=1, le=180)

class AnswerSubmission(BaseModel):
    testParams: TestParams
    questions: list = Field(min_length=1, max_length=50)
    answers: dict

def parse_questions_response(response_text):
    try:
        # Extract JSON from response
        json_match = re.search(r'```json\n(.*?)\n```', response_text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))

        # Try alternative JSON pattern
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except:
                pass

        # Fallback: Parse raw response if JSON is not found
        questions = []
        question_blocks = response_text.split('\n\n')

        for block in question_blocks:
            lines = block.strip().split('\n')
            if len(lines) < 2:
                continue

            question = lines[0].replace('Q:', '').strip()
            options = []
            correct_answer = ""

            for line in lines[1:]:
                if line.startswith('-') or line.startswith('*'):
                    options.append(line[1:].strip())
                elif line.startswith('Answer:') or line.startswith('Correct Answer:'):
                    correct_answer = line.split(':', 1)[1].strip()

            questions.append({
                'question': question,
                'options': options if options else None,
                'correctAnswer': correct_answer if correct_answer else "Sample answer"
            })

        return questions[:10]  # Return max 10 questions

    except HTTPException:
        raise
    except Exception as e:
        print(f"Parse error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to parse generated questions: {str(e)}")

@router.post("/generate-test")
async def generate_test(params: TestParams, model=Depends(get_model)):
    try:
        prompt = f"""
        You are a professional test creator. Generate a mock test with 10 questions based on the following parameters:
        - Purpose: {params.purpose}
        - Subject: {params.subject}
        - Difficulty: {params.difficulty}
        - Test Type: {params.testType}
        - Time Limit: {params.timeLimit} minutes
        
        The test should include a mix of multiple-choice and open-ended questions appropriate for the subject and difficulty level.
        For multiple-choice questions, provide 4 options with one correct answer.
        
        Return the questions in JSON format like this:
        ```json
        [
            {{
                "id": 1,
                "question": "What is the capital of France?",
                "options": ["London", "Paris", "Berlin", "Madrid"],
                "correctAnswer": "Paris"
            }},
            {{
                "id": 2,
                "question": "Explain the concept of gravity.",
                "correctAnswer": "Gravity is a natural phenomenon by which all things with mass are brought toward one another."
            }}
        ]
        ```
        
        Be sure to format your response as valid JSON surrounded by ```json and ``` markers.
        """
        
        # Add print statement for debugging
        print(f"Sending request to Gemini with params: {params}")
        
        response = await model.generate_content(prompt)
        
        # Add debug output
        print(f"Received response from Gemini: {response.text[:100]}...")
        
        if not response.text:
            raise HTTPException(status_code=500, detail="Failed to generate questions.")

        questions = parse_questions_response(response.text)
        
        # Debug the parsed questions
        print(f"Parsed questions: {questions}")
        
        # If no questions were parsed, return an error
        if not questions:
            raise HTTPException(status_code=500, detail="Failed to parse any questions from the response.")

        # Assign IDs if missing
        for i, q in enumerate(questions, 1):
            if 'id' not in q:
                q['id'] = i
            # Ensure correctAnswer exists
            if 'correctAnswer' not in q:
                q['correctAnswer'] = "Sample answer"

        return {"questions": questions}

    except HTTPException:
        raise
    except Exception as e:
        # More detailed error message
        import traceback
        error_detail = str(e) + "\n" + traceback.format_exc()
        print(f"Error in generate_test: {error_detail}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/submit-answers")
async def submit_answers(data: AnswerSubmission, model=Depends(get_model)):
    try:
        answers = []
        correct_count = 0

        for question in data.questions:
            user_answer = data.answers.get(str(question.get('id')), "")
            correct_answer = question.get('correctAnswer', '')
            is_correct = str(user_answer).strip().lower() == str(correct_answer).strip().lower()

            if is_correct:
                correct_count += 1

            answers.append({
                "question": question.get('question', ''),
                "userAnswer": user_answer,
                "correctAnswer": correct_answer,
                "correct": is_correct
            })

        # Generate feedback
        feedback_prompt = f"""
        Provide detailed feedback for a mock test with the following parameters:
        - Subject: {data.testParams.subject}
        - Difficulty: {data.testParams.difficulty}
        - Test Type: {data.testParams.testType}

        The user scored {correct_count} out of {len(data.questions)}.
        Here are the questions and answers:

        {json.dumps(answers, indent=2)}

        Provide:
        1. An overall assessment of performance
        2. Areas of strength
        3. Areas needing improvement
        4. Study recommendations
        5. Detailed explanations for any incorrect answers
        """

        feedback_response = await model.generate_content(feedback_prompt)
        if not feedback_response.text:
            raise HTTPException(status_code=500, detail="Failed to generate feedback.")

        return {
            "score": int((correct_count / len(data.questions)) * 100),
            "correctAnswers": correct_count,
            "incorrectAnswers": len(data.questions) - correct_count,
            "feedback": feedback_response.text,
            "questionAnalysis": answers
        }

    except HTTPException:
        raise
    except Exception as e:
        # More detailed error message
        import traceback
        error_detail = str(e) + "\n" + traceback.format_exc()
        print(f"Error in submit_answers: {error_detail}")
        raise HTTPException(status_code=500, detail=str(e))

# Simple test endpoint to verify API is working
@router.get("/test")
async def test_endpoint():
    return {"status": "ok", "message": "API is working"}