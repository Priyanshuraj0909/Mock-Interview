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
    factory.assert_called_once_with(api_key='test-key', timeout=10.0, max_retries=0)
    assert create.call_args.kwargs['messages'] == [{'role': 'user', 'content': 'make questions'}]


def test_permanent_gemini_error_skips_retry(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    model = GeminiModel('test-gemini')
    model._generate_gemini = AsyncMock(side_effect=errors.ClientError(401, {'error': {'code': 401, 'message': 'not authorized'}}))
    model._generate_groq = AsyncMock(return_value=SimpleNamespace(text='fallback'))
    assert asyncio.run(model.generate_content('prompt')).text == 'fallback'
    assert model._generate_gemini.await_count == 1


@pytest.fixture
def groq_mock(monkeypatch):
    import ai_service
    from unittest.mock import MagicMock
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    monkeypatch.setenv('GROQ_MODELS', 'first,second,third')
    create = AsyncMock()
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(ai_service, 'AsyncGroq', MagicMock(return_value=context))
    return create


def groq_reply(text='answer'):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


def groq_error(code):
    from groq import APIStatusError
    response = httpx.Response(code, request=httpx.Request('POST', 'https://api.groq.com/test'))
    return APIStatusError('provider failure', response=response, body={})


def test_groq_tries_models_in_order_and_stops_at_success(groq_mock):
    groq_mock.side_effect = [groq_error(429), groq_reply('second answer')]
    model = GeminiModel()
    assert asyncio.run(model.generate_content('prompt')).text == 'second answer'
    assert [call.kwargs['model'] for call in groq_mock.await_args_list] == ['first', 'second']


def test_groq_skips_unavailable_model_and_empty_output(groq_mock):
    groq_mock.side_effect = [groq_error(404), groq_reply('  '), groq_reply('third answer')]
    assert asyncio.run(GeminiModel().generate_content('prompt')).text == 'third answer'
    assert [call.kwargs['model'] for call in groq_mock.await_args_list] == ['first', 'second', 'third']


def test_groq_invalid_key_stops_entire_chain(groq_mock):
    groq_mock.side_effect = groq_error(401)
    with pytest.raises(HTTPException) as error:
        asyncio.run(GeminiModel().generate_content('prompt'))
    assert error.value.status_code == 503
    assert groq_mock.await_count == 1


def test_groq_exhausted_chain_has_friendly_response(groq_mock):
    groq_mock.side_effect = groq_error(503)
    with pytest.raises(HTTPException) as error:
        asyncio.run(GeminiModel().generate_content('prompt'))
    assert error.value.status_code == 503
    assert error.value.headers['Retry-After'] == '10'
    assert groq_mock.await_count == 3


def test_configured_models_are_trimmed_and_deduplicated(monkeypatch):
    monkeypatch.setenv('GROQ_MODELS', ' first,second,first, , third ')
    monkeypatch.setenv('GROQ_MODEL', 'legacy')
    assert GeminiModel().groq_models == ['first', 'second', 'third']


def test_legacy_model_is_followed_by_defaults(monkeypatch):
    from ai_service import DEFAULT_GROQ_MODELS
    monkeypatch.delenv('GROQ_MODELS', raising=False)
    monkeypatch.setenv('GROQ_MODEL', 'custom')
    assert GeminiModel().groq_models == ['custom', *DEFAULT_GROQ_MODELS]


def test_total_request_timeout_returns_retry_message(monkeypatch):
    import ai_service
    monkeypatch.setattr(ai_service, 'AI_REQUEST_TIMEOUT', 0.01)
    async def slow_request(prompt):
        await asyncio.sleep(1)
    model = GeminiModel('test-key')
    model._generate_gemini = slow_request
    with pytest.raises(HTTPException) as error:
        asyncio.run(model.generate_content('prompt'))
    assert error.value.status_code == 503


def test_model_timeout_advances_to_next_model(groq_mock, monkeypatch):
    import ai_service
    monkeypatch.setattr(ai_service, 'GROQ_MODEL_TIMEOUT', 0.01)
    attempts = []
    async def completion(**kwargs):
        attempts.append(kwargs['model'])
        if kwargs['model'] == 'first':
            await asyncio.sleep(1)
        return groq_reply('recovered')
    groq_mock.side_effect = completion
    assert asyncio.run(GeminiModel().generate_content('prompt')).text == 'recovered'
    assert attempts == ['first', 'second']
