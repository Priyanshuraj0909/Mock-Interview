import asyncio
import json
from datetime import timedelta
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from bson import ObjectId
from main import app
from session_store import create_session, utcnow
from routers import auth
from telemetry import emit


def signup(client):
    result = client.post('/api/auth/signup', json={'name': 'Test', 'email': 'release@example.com', 'purpose': 'Practice', 'password': 'test-password'})
    assert result.status_code == 200, result.text
    return {'Authorization': 'Bearer ' + result.json()['token']}


def test_refresh_rotates_and_cannot_be_replayed(database):
    with TestClient(app) as client:
        headers = signup(client)
        original = client.cookies.get('practice_refresh')
        response = client.post('/api/auth/refresh')
        assert response.status_code == 200
        assert 'HttpOnly' in response.headers['set-cookie']
        assert 'SameSite=strict' in response.headers['set-cookie']
        assert client.cookies.get('practice_refresh') != original
        assert client.get('/api/sessions', headers={'Authorization': 'Bearer ' + response.json()['token']}).status_code == 200
        replay = client.post('/api/auth/refresh', headers={'Cookie': f'practice_refresh={original}'})
        assert replay.status_code == 401


def test_reset_is_single_use_and_revokes_existing_tokens(database):
    with TestClient(app) as client:
        headers = signup(client)
        code = client.post('/api/auth/recovery-code', headers=headers, json={'password': 'test-password'}).json()['recoveryCode']
        assert database['users'].documents[0]['recoveryHash'] != code
        payload = {'email': 'release@example.com', 'recoveryCode': code, 'password': 'new-password'}
        assert client.post('/api/auth/reset-password', json=payload).status_code == 200
        assert client.get('/api/sessions', headers=headers).status_code == 401
        assert client.post('/api/auth/refresh').status_code == 401
        assert client.post('/api/auth/reset-password', json=payload).status_code == 400
        assert client.post('/api/auth/login', json={'email': payload['email'], 'password': 'test-password'}).status_code == 401
        assert client.post('/api/auth/login', json={'email': payload['email'], 'password': 'new-password'}).status_code == 200


def test_recovery_and_deletion_require_password_and_remove_only_owner(database):
    with TestClient(app) as client:
        headers = signup(client)
        owner = str(database['users'].documents[0]['_id'])
        database['sessions'].documents.extend([{'_id': 'mine', 'userId': owner}, {'_id': 'theirs', 'userId': 'other'}])
        assert client.post('/api/auth/delete-account', headers=headers, json={'password': 'wrong'}).status_code == 403
        assert len(database['users'].documents) == 1
        assert client.post('/api/auth/recovery-code', headers=headers, json={'password': 'wrong'}).status_code == 403
        assert client.post('/api/auth/delete-account', headers=headers, json={'password': 'test-password'}).status_code == 200
        assert database['sessions'].documents == [{'_id': 'theirs', 'userId': 'other'}]
        assert not database['users'].documents
        assert not database['refresh_tokens'].documents
        assert client.get('/api/analytics', headers=headers).status_code == 401


def test_expired_refresh_and_logout(database):
    with TestClient(app) as client:
        signup(client)
        database['refresh_tokens'].documents[0]['expiresAt'] = utcnow() - timedelta(seconds=1)
        assert client.post('/api/auth/refresh').status_code == 401
        client.post('/api/auth/login', json={'email': 'release@example.com', 'password': 'test-password'})
        assert client.post('/api/auth/logout').status_code == 200
        assert not client.cookies.get('practice_refresh')
        assert client.post('/api/auth/refresh').status_code == 401


def test_auth_attempts_are_limited(database):
    with TestClient(app) as client:
        for _ in range(10):
            assert client.post('/api/auth/login', json={'email': 'none@example.com', 'password': 'wrong'}).status_code == 401
        assert client.post('/api/auth/login', json={'email': 'none@example.com', 'password': 'wrong'}).status_code == 429


def test_progress_is_private_deduplicated_and_excludes_followups(database, signed_in):
    user_id = str(database['users'].documents[0]['_id'])
    for i in range(2):
        session = asyncio.run(create_session(database, user_id, 'interview', {'interviewType': 'frontend', 'difficultyLevel': 2},
            [{'id': 1, 'text': 'Explain hooks', 'topic': 'Hooks'}, {'id': 2, 'text': 'More hooks', 'topic': 'Hooks', 'parentId': 1}]))
        asyncio.run(database['sessions'].update_one({'_id': session['_id']}, {'$set': {'evaluations': {'1': {'score': 4 + i}, '2': {'score': 10}}}}))
    database['sessions'].documents.append({'_id': 'private', 'userId': 'other', 'createdAt': utcnow()})
    with TestClient(app) as client:
        report = client.get('/api/analytics', headers=signed_in).json()
    assert report['sessionsScanned'] == 2
    assert report['repeatedQuestionsExcluded'] == 1
    assert report['topics'][0]['uniqueQuestions'] == 1
    assert report['topics'][0]['score'] == 50
    assert len(report['trends']) == 2
    assert 'private' not in json.dumps(report)


def test_telemetry_opt_in_and_field_allowlist(monkeypatch, caplog):
    monkeypatch.delenv('AI_TELEMETRY_ENABLED', raising=False)
    emit('ai_call', prompt='private', latencyMs=12)
    assert not caplog.records
    monkeypatch.setenv('AI_TELEMETRY_ENABLED', 'true')
    emit('ai_call', prompt='private', answer='secret', resume='resume', latencyMs=12, inputTokens=10)
    row = json.loads(caplog.records[-1].message)
    assert row == {'event': 'ai_call', 'latencyMs': 12, 'inputTokens': 10}


def test_generation_finishing_after_account_deletion_cannot_leave_private_data(database):
    from fastapi import HTTPException
    import pytest
    missing_owner = str(ObjectId())
    with pytest.raises(HTTPException) as error:
        asyncio.run(create_session(database, missing_owner, 'interview', {}, [{'id': 1, 'text': 'Private question'}]))
    assert error.value.status_code == 401
    assert not database['sessions'].documents


def test_interrupted_account_deletion_can_finish_after_password_login(database):
    with TestClient(app) as client:
        signup(client)
        user = database['users'].documents[0]
        user['deleting'] = True
        database['sessions'].documents.append({'_id': 'leftover', 'userId': str(user['_id'])})
        response = client.post('/api/auth/login', json={'email': 'release@example.com', 'password': 'test-password'})
        assert response.status_code == 401
        assert 'deletion completed' in response.json()['detail']
        assert not database['users'].documents
        assert not database['sessions'].documents
        assert not database['refresh_tokens'].documents


def test_new_private_endpoints_require_authentication(database):
    with TestClient(app) as client:
        assert client.get('/api/analytics').status_code == 401
        for endpoint in ['recovery-code', 'delete-account']:
            assert client.post('/api/auth/' + endpoint, json={'password': 'test-password'}).status_code == 401


def test_abandoned_smoke_cleanup_is_bounded_and_preserves_regular_accounts(database):
    from datetime import datetime, timezone
    from release_migrations import cleanup_abandoned_smoke_account
    marker = {'name': 'Release verification', 'purpose': 'Deployment verification', 'created_at': datetime(2026, 11, 1, 7, 41, tzinfo=timezone.utc)}
    abandoned, ordinary, future = ObjectId(), ObjectId(), ObjectId()
    database['users'].documents.extend([
        {**marker, '_id': abandoned, 'email': 'release-0123456789abcdef@example.com'},
        {**marker, '_id': ordinary, 'email': 'person@example.com'},
        {**marker, '_id': future, 'email': 'release-aaaaaaaaaaaaaaaa@example.com', 'created_at': datetime(2026, 11, 1, 8, tzinfo=timezone.utc)},
    ])
    database['sessions'].documents.extend([{'_id': 'test', 'userId': str(abandoned)}, {'_id': 'normal', 'userId': str(ordinary)}])
    asyncio.run(cleanup_abandoned_smoke_account(database))
    assert {row['_id'] for row in database['users'].documents} == {ordinary, future}
    assert database['sessions'].documents == [{'_id': 'normal', 'userId': str(ordinary)}]
    asyncio.run(cleanup_abandoned_smoke_account(database))
    assert len(database['maintenance'].documents) == 1
