"""Verify a deployed release using a disposable account, removed at the end."""
import argparse
import http.cookiejar
import json
import secrets
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='https://mock-interview-king-09.vercel.app')
    parser.add_argument('--version', default='0.3.0')
    parser.add_argument('--allow-create-account', action='store_true')
    parser.add_argument('--live-ai', action='store_true', help='Exercise providers; consumes credits.')
    args = parser.parse_args()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    token = ''
    def call(path, payload=None, method=None, expected=200, raw=None):
        data = raw if raw is not None else json.dumps(payload).encode() if payload is not None else None
        headers = {'Content-Type': 'text/plain' if raw is not None else 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        request = urllib.request.Request(args.url.rstrip('/') + '/api' + path, data=data, headers=headers, method=method)
        try:
            response = opener.open(request, timeout=90)
        except urllib.error.HTTPError as exc:
            response = exc
        if response.status != expected:
            raise RuntimeError(f'{path}: expected {expected}, received {response.status}')
        return json.loads(response.read())
    health = call('/test')
    assert health['version'] == args.version, 'Unexpected deployed version'
    call('/sessions', expected=401)
    print('PASS release version and private API authentication')
    if not args.allow_create_account:
        return
    email = f'release-{secrets.token_hex(8)}@example.com'
    password = secrets.token_urlsafe(24)
    created = False
    try:
        account = call('/auth/signup', {'name': 'Release verification', 'email': email, 'purpose': 'Deployment verification', 'password': password})
        created = True
        token = account['token']
        assert call('/sessions')['sessions'] == []
        assert call('/analytics')['sessionsScanned'] == 0
        code = call('/auth/recovery-code', {'password': password})['recoveryCode']
        next_password = secrets.token_urlsafe(24)
        call('/auth/reset-password', {'email': email, 'recoveryCode': code, 'password': next_password})
        password = next_password
        call('/sessions', expected=401)
        token = call('/auth/login', {'email': email, 'password': password})['token']
        token = call('/auth/refresh', {})['token']
        call('/sessions')
        print('PASS accounts, recovery, revocation, refresh, history and analytics')
        if args.live_ai:
            assert call('/resume/extract', raw=b'Python backend engineer with FastAPI experience.')['characters'] > 0
            session = call('/generate-test', {'purpose': 'Practice', 'subject': 'Python', 'difficulty': 'easy', 'testType': 'conceptual', 'timeLimit': 10})
            assert len(session['questions']) == 10
            assert all('correctAnswer' not in q for q in session['questions'])
            answers = {str(q['id']): q['options'][0] if q.get('options') else 'I would explain the concept and verify edge cases.' for q in session['questions']}
            call(f'/sessions/{session["sessionId"]}/answers', {'answers': answers, 'revision': 0}, method='PATCH')
            assert call(f'/sessions/{session["sessionId"]}')['answers'] == answers
            call('/submit-answers', {'sessionId': session['sessionId'], 'answers': answers})
            interview = call('/interview/generate-questions', {'interviewType': 'backend_developer', 'difficultyLevel': 1, 'resumeText': 'Python backend engineer using FastAPI.'})
            question = interview['questions'][0]
            call('/interview/evaluate-answer', {'sessionId': interview['sessionId'], 'questionId': question['id'], 'answer': 'I would clarify requirements, explain the relevant concepts and test edge cases.'})
            call('/interview/follow-up', {'sessionId': interview['sessionId'], 'questionId': question['id']})
            assert len(call('/sessions')['sessions']) == 2
            assert call('/analytics')['sessionsScanned'] == 2
            print('PASS live resume extraction, test generation, autosave/reload, grading and adaptive interview')
    finally:
        if created:
            # Reauthenticate if a prior check failed during token revocation.
            token = call('/auth/login', {'email': email, 'password': password})['token']
            call('/auth/delete-account', {'password': password})
            call('/sessions', expected=401)
            print('PASS disposable account and practice data deletion')


if __name__ == '__main__':
    main()
