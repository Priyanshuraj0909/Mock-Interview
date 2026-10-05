import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from google.genai import errors

from ai_service import GeminiModel


def overloaded():
    return errors.ServerError(503, {'error': {'code': 503, 'message': 'overloaded', 'status': 'UNAVAILABLE'}})


def test_gemini_success_does_not_call_groq(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    model = GeminiModel('test-gemini')
    model._generate_gemini = AsyncMock(return_value=SimpleNamespace(text='gemini answer'))
    model._generate_groq = AsyncMock()
    assert asyncio.run(model.generate_content('prompt')).text == 'gemini answer'
    model._generate_groq.assert_not_awaited()


def test_retries_overload_then_falls_back(monkeypatch):
    import ai_service
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    monkeypatch.setattr(ai_service.asyncio, 'sleep', AsyncMock())
    model = GeminiModel('test-gemini')
    model._generate_gemini = AsyncMock(side_effect=overloaded())
    model._generate_groq = AsyncMock(return_value=SimpleNamespace(text='groq answer'))
    assert asyncio.run(model.generate_content('prompt')).text == 'groq answer'
    assert model._generate_gemini.await_count == 2
    model._generate_groq.assert_awaited_once_with('prompt')


def test_gemini_retry_can_recover_without_fallback(monkeypatch):
    import ai_service
    monkeypatch.setattr(ai_service.asyncio, 'sleep', AsyncMock())
    model = GeminiModel('test-gemini')
    model._generate_gemini = AsyncMock(side_effect=[overloaded(), SimpleNamespace(text='recovered')])
    model._generate_groq = AsyncMock()
    assert asyncio.run(model.generate_content('prompt')).text == 'recovered'
    model._generate_groq.assert_not_awaited()


def test_groq_only_configuration(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    model = GeminiModel()
    model._generate_gemini = AsyncMock()
    model._generate_groq = AsyncMock(return_value=SimpleNamespace(text='groq answer'))
    assert asyncio.run(model.generate_content('prompt')).text == 'groq answer'
    model._generate_gemini.assert_not_awaited()


def test_both_providers_failing_returns_friendly_retry(monkeypatch):
    import ai_service
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    monkeypatch.setattr(ai_service.asyncio, 'sleep', AsyncMock())
    model = GeminiModel('test-gemini')
    model._generate_gemini = AsyncMock(side_effect=overloaded())
    model._generate_groq = AsyncMock(side_effect=httpx.ConnectError('private-provider-detail'))
    with pytest.raises(HTTPException) as error:
        asyncio.run(model.generate_content('prompt'))
    assert error.value.status_code == 503
    assert error.value.headers['Retry-After'] == '10'
    assert 'private-provider-detail' not in error.value.detail


def test_provider_503_is_preserved_by_all_routes():
    from fastapi.testclient import TestClient
    from main import app
    from routers import tests, interview
    model = SimpleNamespace(generate_content=AsyncMock(side_effect=HTTPException(status_code=503, detail='Temporarily busy', headers={'Retry-After': '10'})))
    app.dependency_overrides[tests.get_model] = lambda: model
    app.dependency_overrides[interview.get_model] = lambda: model
    params = {'purpose': 'practice', 'subject': 'React', 'difficulty': 'medium', 'testType': 'conceptual', 'timeLimit': 30}
    requests = [
        ('/api/generate-test', params),
        ('/api/submit-answers', {'testParams': params, 'questions': [{'id': 1, 'question': 'Question', 'correctAnswer': 'A'}], 'answers': {'1': 'A'}}),
        ('/api/interview/generate-questions', {'interviewType': 'frontend_developer'}),
        ('/api/interview/evaluate-answer', {'interviewType': 'frontend_developer', 'question': 'Question', 'answer': 'Answer'}),
    ]
    try:
        for path, payload in requests:
            response = TestClient(app).post(path, json=payload)
            assert response.status_code == 503
            assert response.headers['retry-after'] == '10'
            assert response.json()['detail'] == 'Temporarily busy'
    finally:
        app.dependency_overrides.clear()


def test_groq_adapter_returns_compatible_text(monkeypatch):
    import ai_service
    from unittest.mock import MagicMock
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='[{"id":1}]'))])
    create = AsyncMock(return_value=response)
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=False)
    factory = MagicMock(return_value=context)
    monkeypatch.setattr(ai_service, 'AsyncGroq', factory)
    model = GeminiModel()
    assert asyncio.run(model.generate_content('make questions')).text == '[{"id":1}]'
    factory.assert_called_once_with(api_key='test-key', timeout=20.0, max_retries=0)
    assert create.call_args.kwargs['messages'] == [{'role': 'user', 'content': 'make questions'}]


def test_permanent_gemini_error_skips_retry(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    model = GeminiModel('test-gemini')
    model._generate_gemini = AsyncMock(side_effect=errors.ClientError(401, {'error': {'code': 401, 'message': 'not authorized'}}))
    model._generate_groq = AsyncMock(return_value=SimpleNamespace(text='fallback'))
    assert asyncio.run(model.generate_content('prompt')).text == 'fallback'
    assert model._generate_gemini.await_count == 1
