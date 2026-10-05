import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from main import app
from routers import tests, interview

client = TestClient(app)

def test_health():
    assert client.get('/api/test').json()['status'] == 'ok'

def test_ai_endpoints_report_missing_configuration(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    response = client.post('/api/generate-test', json={
        'purpose': 'Practice', 'subject': 'React', 'difficulty': 'medium',
        'testType': 'conceptual', 'timeLimit': 30,
    })
    assert response.status_code == 503
    assert 'GEMINI_API_KEY' in response.json()['detail']
    response = client.post('/api/interview/generate-questions', json={'interviewType': 'frontend_developer'})
    assert response.status_code == 503

def test_accounts_report_missing_database(monkeypatch):
    monkeypatch.delenv('MONGODB_URI', raising=False)
    monkeypatch.delenv('MONGO_URL', raising=False)
    response = client.post('/api/auth/login', json={'email': 'person@example.com', 'password': 'test-password'})
    assert response.status_code == 503

def test_empty_submission_is_rejected():
    app.dependency_overrides[tests.get_model] = lambda: object()
    try:
        response = client.post('/api/submit-answers', json={
            'testParams': {'purpose': 'Practice', 'subject': 'React', 'difficulty': 'medium', 'testType': 'conceptual', 'timeLimit': 30},
            'questions': [], 'answers': {},
        })
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()

def test_interview_difficulty_is_bounded():
    app.dependency_overrides[interview.get_model] = lambda: object()
    try:
        assert client.post('/api/interview/generate-questions', json={'interviewType': 'frontend_developer', 'difficultyLevel': 9}).status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_async_ai_question_generation():
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    model = SimpleNamespace(generate_content=AsyncMock(return_value=SimpleNamespace(text='[{"id": 1, "question": "Explain React", "correctAnswer": "A UI library"}]')))
    app.dependency_overrides[tests.get_model] = lambda: model
    try:
        response = client.post('/api/generate-test', json={
            'purpose': 'Practice', 'subject': 'React', 'difficulty': 'medium',
            'testType': 'conceptual', 'timeLimit': 30,
        })
        assert response.status_code == 200
        assert response.json()['questions'][0]['question'] == 'Explain React'
        model.generate_content.assert_awaited_once()
    finally:
        app.dependency_overrides.clear()


def test_database_connection_failure_is_recoverable(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from pymongo.errors import ServerSelectionTimeoutError
    from database import get_database
    from routers import auth
    monkeypatch.setattr(auth, 'SECRET_KEY', 'test-secret-' * 4)
    collection = SimpleNamespace(find_one=AsyncMock(side_effect=ServerSelectionTimeoutError('SSL handshake failed: private-host')))
    app.dependency_overrides[get_database] = lambda: {'users': collection}
    try:
        for path, payload in [
            ('/api/auth/signup', {'name': 'Test', 'email': 'test@example.com', 'purpose': 'practice', 'password': 'test-password'}),
            ('/api/auth/login', {'email': 'test@example.com', 'password': 'test-password'}),
        ]:
            response = client.post(path, json=payload)
            assert response.status_code == 503
            assert response.headers['retry-after'] == '10'
            assert 'database is unavailable' in response.json()['message']
            assert 'private-host' not in response.text
    finally:
        app.dependency_overrides.clear()


def test_atlas_uses_verified_ca_bundle(monkeypatch):
    from unittest.mock import Mock
    import database
    import certifi
    factory = Mock()
    monkeypatch.setenv('MONGODB_URI', 'mongodb+srv://example.mongodb.net/test')
    monkeypatch.setattr(database, 'AsyncIOMotorClient', factory)
    database._build_client()
    assert factory.call_args.kwargs['tls'] is True
    assert factory.call_args.kwargs['tlsCAFile'] == certifi.where()
    assert 'tlsAllowInvalidCertificates' not in factory.call_args.kwargs
