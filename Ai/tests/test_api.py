import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from main import app
from routers import tests, interview
from session_store import create_session, utcnow

client = TestClient(app)
PARAMS = {'purpose': 'Practice', 'subject': 'React', 'difficulty': 'medium', 'testType': 'conceptual', 'timeLimit': 30}


def stub_model(route, payload):
    model = SimpleNamespace(generate_content=AsyncMock(return_value=SimpleNamespace(text=json.dumps(payload))))
    app.dependency_overrides[route.get_model] = lambda: model
    return model


def questions():
    return [{'id': i, 'question': f'Question {i}', 'options': ['A', 'B', 'C', 'D'], 'correctAnswer': 'A'} for i in range(1, 11)]


def new_test(headers):
    stub_model(tests, questions())
    response = client.post('/api/generate-test', headers=headers, json=PARAMS)
    assert response.status_code == 200, response.text
    return response.json()


def new_interview(headers):
    stub_model(interview, {'questions': [{'id': i, 'text': f'Explain concept {i}', 'topic': 'React hooks'} for i in range(1, 6)]})
    response = client.post('/api/interview/generate-questions', headers=headers, json={'interviewType': 'frontend_developer', 'resumeText': 'Built a React dashboard'})
    assert response.status_code == 200, response.text
    return response.json()


def test_health():
    assert client.get('/api/test').json()['status'] == 'ok'


@pytest.mark.parametrize('method,path,payload', [
    ('post', '/api/generate-test', PARAMS),
    ('post', '/api/submit-answers', {'sessionId': 'unknown', 'answers': {}}),
    ('post', '/api/interview/generate-questions', {'interviewType': 'frontend_developer'}),
    ('post', '/api/interview/evaluate-answer', {'sessionId': 'unknown', 'questionId': 1, 'answer': 'A'}),
    ('post', '/api/interview/follow-up', {'sessionId': 'unknown', 'questionId': 1}),
    ('get', '/api/sessions', None),
    ('get', '/api/sessions/unknown', None),
    ('patch', '/api/sessions/unknown/answers', {'answers': {}, 'revision': 0}),
])
def test_practice_requires_authentication(database, method, path, payload):
    response = getattr(client, method)(path, **({'json': payload} if payload else {}))
    assert response.status_code == 401


def test_expired_invalid_and_deleted_user_tokens_are_rejected(database):
    from routers import auth
    from jose import jwt
    from bson import ObjectId
    for token in ['bad-token', jwt.encode({'sub': str(ObjectId()), 'exp': utcnow() - timedelta(seconds=10)}, auth.SECRET_KEY),
                  auth._create_access_token({'sub': str(ObjectId())})]:
        assert client.get('/api/sessions', headers={'Authorization': f'Bearer {token}'}).status_code == 401


def test_ai_endpoints_report_missing_configuration(database, signed_in, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.delenv('GROQ_API_KEY', raising=False)
    assert client.post('/api/generate-test', headers=signed_in, json=PARAMS).status_code == 503
    assert client.post('/api/interview/generate-questions', headers=signed_in, json={'interviewType': 'frontend_developer'}).status_code == 503


def test_accounts_report_missing_database(monkeypatch):
    monkeypatch.delenv('MONGODB_URI', raising=False)
    monkeypatch.delenv('MONGO_URL', raising=False)
    assert client.post('/api/auth/login', json={'email': 'person@example.com', 'password': 'test-password'}).status_code == 503


def test_generation_hides_keys_and_stores_owner(database, signed_in):
    session = new_test(signed_in)
    assert all('correctAnswer' not in q for q in session['questions'])
    saved = database['sessions'].documents[0]
    assert saved['questions'][0]['correctAnswer'] == 'A'
    assert saved['userId']
    assert 'userId' not in session
    restored = client.get(f"/api/sessions/{session['sessionId']}", headers=signed_in).json()
    assert restored['sessionId'] == session['sessionId']
    assert all('correctAnswer' not in q for q in restored['questions'])


@pytest.mark.parametrize('payload', [questions()[:1], 'not JSON', [*questions()[:-1], questions()[0]],
                                     [{**q, 'correctAnswer': 'unknown option'} for q in questions()]])
def test_malformed_questions_are_not_saved(database, signed_in, payload):
    stub_model(tests, payload)
    response = client.post('/api/generate-test', headers=signed_in, json=PARAMS)
    assert response.status_code == 503
    assert database['sessions'].documents == []


def test_cannot_read_update_or_grade_another_users_session(database, signed_in):
    from bson import ObjectId
    from routers import auth
    session = new_test(signed_in)
    another = ObjectId()
    database['users'].documents.append({'_id': another})
    headers = {'Authorization': f'Bearer {auth._create_access_token({"sub": str(another)})}'}
    session_id = session['sessionId']
    for method, path, body in [('get', f'/api/sessions/{session_id}', None),
                               ('patch', f'/api/sessions/{session_id}/answers', {'answers': {'1': 'A'}, 'revision': 0}),
                               ('post', '/api/submit-answers', {'sessionId': session_id, 'answers': {'1': 'A'}})]:
        response = getattr(client, method)(path, headers=headers, **({'json': body} if body else {}))
        assert response.status_code == 404
    assert client.get('/api/sessions', headers=headers).json()['sessions'] == []


def test_autosave_conflicts_do_not_overwrite_answers(database, signed_in):
    session = new_test(signed_in)
    path = f"/api/sessions/{session['sessionId']}/answers"
    assert client.patch(path, headers=signed_in, json={'answers': {'1': 'A'}, 'revision': 0}).json()['revision'] == 1
    assert client.patch(path, headers=signed_in, json={'answers': {'1': 'B'}, 'revision': 0}).status_code == 409
    assert client.patch(path, headers=signed_in, json={'answers': {'999': 'B'}, 'revision': 1}).status_code == 422
    restored = client.get(f"/api/sessions/{session['sessionId']}", headers=signed_in).json()
    assert restored['answers'] == {'1': 'A'}


def test_grading_uses_saved_keys_and_retries_are_idempotent(database, signed_in):
    session = new_test(signed_in)
    model = stub_model(tests, {'evaluations': [], 'feedback': 'Review the remaining questions.'})
    payload = {'sessionId': session['sessionId'], 'answers': {'1': 'A'}}
    response = client.post('/api/submit-answers', headers=signed_in, json=payload)
    assert response.status_code == 200
    assert response.json()['score'] == 10
    second = client.post('/api/submit-answers', headers=signed_in, json=payload)
    assert second.json() == response.json()
    model.generate_content.assert_awaited_once()
    assert client.post('/api/submit-answers', headers=signed_in, json={**payload, 'questions': questions()}).status_code == 422
    assert client.patch(f"/api/sessions/{session['sessionId']}/answers", headers=signed_in,
                        json={'answers': {'1': 'B'}, 'revision': 1}).status_code == 409


def test_failed_grading_releases_lease_and_preserves_draft(database, signed_in):
    session = new_test(signed_in)
    stub_model(tests, {'evaluations': [{'questionId': 99}], 'feedback': 'Invalid'})
    payload = {'sessionId': session['sessionId'], 'answers': {'1': 'A'}}
    assert client.post('/api/submit-answers', headers=signed_in, json=payload).status_code == 503
    assert 'leaseId' not in database['sessions'].documents[0]
    stub_model(tests, {'evaluations': [], 'feedback': 'Try again'})
    assert client.post('/api/submit-answers', headers=signed_in, json=payload).status_code == 200


def test_rate_limits_are_database_backed(database, signed_in, monkeypatch):
    monkeypatch.setenv('AI_REQUESTS_PER_MINUTE', '1')
    new_test(signed_in)
    response = client.post('/api/generate-test', headers=signed_in, json=PARAMS)
    assert response.status_code == 429
    assert int(response.headers['Retry-After']) >= 1


def test_interview_resume_feedback_and_adaptive_followup(database, signed_in):
    session = new_interview(signed_in)
    assert 'resumeText' not in session['params']
    model = app.dependency_overrides[interview.get_model]()
    assert 'Built a React dashboard' in model.generate_content.call_args.args[0]
    feedback = {'score': 5, 'feedback': 'Partially correct', 'strengthPoints': ['Knows hooks'], 'improvementPoints': ['Explain effect cleanup']}
    model = stub_model(interview, feedback)
    payload = {'sessionId': session['sessionId'], 'questionId': 1, 'answer': 'Hooks manage state'}
    response = client.post('/api/interview/evaluate-answer', headers=signed_in, json=payload)
    assert response.status_code == 200
    assert response.json()['improvementPoints'] == ['Explain effect cleanup']
    assert client.post('/api/interview/evaluate-answer', headers=signed_in, json=payload).json() == feedback
    model.generate_content.assert_awaited_once()
    model = stub_model(interview, {'id': 1, 'text': 'How do you clean up a subscription?', 'topic': 'Cleanup'})
    followup = client.post('/api/interview/follow-up', headers=signed_in, json={'sessionId': session['sessionId'], 'questionId': 1})
    assert followup.status_code == 200
    assert followup.json()['id'] == 6
    assert followup.json()['parentId'] == 1
    assert 'Partially correct' in model.generate_content.call_args.args[0]
    assert client.post('/api/interview/follow-up', headers=signed_in, json={'sessionId': session['sessionId'], 'questionId': 1}).json() == followup.json()
    model.generate_content.assert_awaited_once()
    restored = client.get(f"/api/sessions/{session['sessionId']}", headers=signed_in).json()
    assert restored['questions'][1]['id'] == 6
    assert restored['answers']['1'] == 'Hooks manage state'


def test_invalid_feedback_never_publishes_a_score(database, signed_in):
    session = new_interview(signed_in)
    stub_model(interview, {'score': 99, 'feedback': 'Bad', 'strengthPoints': ['A'], 'improvementPoints': ['B']})
    assert client.post('/api/interview/evaluate-answer', headers=signed_in, json={'sessionId': session['sessionId'], 'questionId': 1, 'answer': 'A'}).status_code == 503
    assert database['sessions'].documents[0]['evaluations'] == {}


def test_interview_difficulty_is_bounded(database, signed_in):
    stub_model(interview, {})
    assert client.post('/api/interview/generate-questions', headers=signed_in, json={'interviewType': 'frontend_developer', 'difficultyLevel': 9}).status_code == 422


def test_resume_validation_and_text_extraction(database, signed_in):
    response = client.post('/api/resume/extract', headers={**signed_in, 'Content-Type': 'text/plain'}, content=b'React developer')
    assert response.json()['text'] == 'React developer'
    assert client.post('/api/resume/extract', headers={**signed_in, 'Content-Type': 'application/pdf'}, content=b'not PDF').status_code == 422
    assert client.post('/api/resume/extract', headers={**signed_in, 'Content-Type': 'text/plain'}, content=b'x' * (2 * 1024 * 1024 + 1)).status_code == 413
    assert client.post('/api/resume/extract', headers={**signed_in, 'Content-Type': 'text/plain'}, content=b' ').status_code == 422
    assert client.post('/api/resume/extract', headers={**signed_in, 'Content-Type': 'image/png'}, content=b'PNG').status_code == 415


def test_database_connection_failure_is_recoverable(monkeypatch):
    from database import get_database
    from pymongo.errors import ServerSelectionTimeoutError
    from routers import auth
    monkeypatch.setattr(auth, 'SECRET_KEY', 'test-secret-' * 4)
    collection = SimpleNamespace(find_one=AsyncMock(side_effect=ServerSelectionTimeoutError('SSL handshake failed: private-host')))
    app.dependency_overrides[get_database] = lambda: {'users': collection}
    try:
        response = client.post('/api/auth/login', json={'email': 'test@example.com', 'password': 'test-password'})
        assert response.status_code == 503
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
    monkeypatch.setattr(database, 'AsyncMongoClient', factory)
    database._build_client()
    assert factory.call_args.kwargs['tls'] is True
    assert factory.call_args.kwargs['tlsCAFile'] == certifi.where()
    assert 'tlsAllowInvalidCertificates' not in factory.call_args.kwargs


def test_graded_interview_answers_cannot_be_changed_by_autosave(database, signed_in):
    session = new_interview(signed_in)
    stub_model(interview, {'score': 6, 'feedback': 'Feedback', 'strengthPoints': ['Understands hooks'], 'improvementPoints': ['Review cleanup']})
    assert client.post('/api/interview/evaluate-answer', headers=signed_in,
                       json={'sessionId': session['sessionId'], 'questionId': 1, 'answer': 'My original answer'}).status_code == 200
    path = f"/api/sessions/{session['sessionId']}/answers"
    assert client.patch(path, headers=signed_in, json={'revision': 1, 'answers': {'1': 'Forged answer'}}).status_code == 422
    assert client.patch(path, headers=signed_in, json={'revision': 1, 'answers': {}}).status_code == 422


def test_active_grading_lease_blocks_overlapping_edits(database, signed_in):
    session = new_test(signed_in)
    stored = database['sessions'].documents[0]
    stored['leaseId'] = 'active-worker'
    stored['leaseUntil'] = utcnow() + timedelta(seconds=90)
    assert client.patch(f"/api/sessions/{session['sessionId']}/answers", headers=signed_in,
                        json={'revision': 0, 'answers': {'1': 'A'}}).status_code == 409
    assert client.post('/api/submit-answers', headers=signed_in,
                       json={'sessionId': session['sessionId'], 'answers': {'1': 'A'}}).status_code == 409
    assert stored['answers'] == {}


def test_expired_grading_lease_can_be_recovered(database, signed_in):
    session = new_test(signed_in)
    stored = database['sessions'].documents[0]
    stored.update(leaseId='crashed-worker', leaseUntil=utcnow() - timedelta(seconds=1))
    stub_model(tests, {'evaluations': [], 'feedback': 'Recovered'})
    assert client.post('/api/submit-answers', headers=signed_in,
                       json={'sessionId': session['sessionId'], 'answers': {'1': 'A'}}).status_code == 200
    assert 'leaseId' not in stored


def test_pdf_with_no_text_and_encrypted_pdf_are_rejected(database, signed_in):
    from io import BytesIO
    from pypdf import PdfWriter
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    for encrypted in [False, True]:
        if encrypted:
            writer.encrypt('test-password')
        stream = BytesIO()
        writer.write(stream)
        response = client.post('/api/resume/extract', headers={**signed_in, 'Content-Type': 'application/pdf'}, content=stream.getvalue())
        assert response.status_code == 422


def test_signup_does_not_silently_truncate_multibyte_passwords():
    from routers.auth import SignupRequest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        SignupRequest(name='Test', email='test@example.com', purpose='Practice', password='é' * 40)


def test_signup_login_and_issued_token_work_together(database):
    payload = {'name': 'Test Person', 'email': 'person@example.com', 'purpose': 'practice', 'password': 'test-password'}
    signup = client.post('/api/auth/signup', json=payload)
    assert signup.status_code == 200
    assert 'password_hash' not in signup.json()['user']
    assert database['users'].documents[0]['password_hash'] != payload['password']
    login = client.post('/api/auth/login', json={'email': payload['email'], 'password': payload['password']})
    assert login.status_code == 200
    headers = {'Authorization': f"Bearer {login.json()['token']}"}
    assert client.get('/api/sessions', headers=headers).status_code == 200
    assert client.post('/api/auth/login', json={'email': payload['email'], 'password': 'wrong-password'}).status_code == 401


def test_expired_worker_cannot_overwrite_newer_answers(database, signed_in):
    import asyncio
    from fastapi import HTTPException
    from session_store import save_with_lease
    session = new_test(signed_in)
    stored = database['sessions'].documents[0]
    snapshot = dict(stored)
    stored.update(leaseId='old-worker', leaseUntil=utcnow() - timedelta(seconds=1))
    assert client.patch(f"/api/sessions/{session['sessionId']}/answers", headers=signed_in,
                        json={'revision': 0, 'answers': {'1': 'B'}}).status_code == 200
    with pytest.raises(HTTPException) as failure:
        asyncio.run(save_with_lease(database, snapshot, 'old-worker', {'answers': {'1': 'A'}, 'status': 'completed'}))
    assert failure.value.status_code == 409
    assert stored['answers'] == {'1': 'B'}
