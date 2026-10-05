import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from main import app
from routers import tests
from grading import parse_report


PARAMS = {'purpose': 'practice', 'subject': 'DSA & C++', 'difficulty': 'medium', 'testType': 'conceptual', 'timeLimit': 30}


def submit(questions, answers, report):
    model = SimpleNamespace(generate_content=AsyncMock(return_value=SimpleNamespace(text=json.dumps(report))))
    app.dependency_overrides[tests.get_model] = lambda: model
    try:
        response = TestClient(app).post('/api/submit-answers', json={'testParams': PARAMS, 'questions': questions, 'answers': answers})
        return response, model
    finally:
        app.dependency_overrides.clear()


def test_paraphrase_and_equivalent_code_use_semantic_verdicts():
    questions = [
        {'id': 7, 'question': 'Describe how to detect a cycle in a singly linked list.', 'correctAnswer': 'Use Floyd’s algorithm with a slow pointer and a fast pointer.'},
        {'id': 9, 'question': 'Write a C++ function to reverse a singly linked list iteratively.', 'correctAnswer': 'ListNode* reverseList(ListNode* head) { /* update next pointers */ }'},
    ]
    answers = {
        '7': 'slow pointer goes one step and fast skips an element; if they meet there is a cycle, if fast reaches null there is no cycle',
        '9': 'Node *rev(Node *head){ Node *curr=head, *prev=nullptr; while(curr){ Node *t=curr->next; curr->next=prev; prev=curr; curr=t; } return prev; }',
    }
    report = {'evaluations': [
        {'questionId': 2, 'correct': True, 'explanation': 'Equivalent pointer reversal with different names.'},
        {'questionId': 1, 'correct': True, 'explanation': 'Describes the same slow/fast pointer algorithm.'},
    ], 'feedback': 'Both essential algorithms are understood.'}
    response, model = submit(questions, answers, report)
    assert response.status_code == 200
    result = response.json()
    assert result['score'] == 100
    assert result['correctAnswers'] == 2
    assert result['incorrectAnswers'] == 0
    assert all(item['correct'] for item in result['questionAnalysis'])
    assert 'slow/fast' in result['questionAnalysis'][0]['explanation']
    assert 'Equivalent pointer' in result['questionAnalysis'][1]['explanation']
    prompt = model.generate_content.call_args.args[0]
    assert 'MEANING and technical correctness' in prompt
    assert 'function names' in prompt


def test_conceptually_wrong_written_answer_remains_incorrect():
    response, _ = submit(
        [{'id': 1, 'question': 'What is the binary search complexity?', 'correctAnswer': 'O(log n)'}],
        {'1': 'It always searches every element so O(n)'},
        {'evaluations': [{'questionId': 1, 'correct': False, 'explanation': 'Binary search halves the search space, so the bound is logarithmic.'}], 'feedback': 'Review binary search complexity.'},
    )
    assert response.json()['score'] == 0
    assert response.json()['questionAnalysis'][0]['correct'] is False
    assert response.json()['questionAnalysis'][0]['explanation']


def test_multiple_choice_and_blanks_are_not_regraded_by_ai():
    questions = [
        {'id': 1, 'question': 'Boolean stream output?', 'options': ['true', '1'], 'correctAnswer': '1'},
        {'id': 2, 'question': 'Binary search complexity?', 'options': ['O(n)', 'O(log n)'], 'correctAnswer': 'O(log n)'},
        {'id': 3, 'question': 'Explain a linked list.', 'correctAnswer': 'Nodes connected by pointers.'},
        {'id': 4, 'question': 'Define a stack.', 'correctAnswer': 'Last in first out.'},
    ]
    response, _ = submit(questions, {'1': 'true', '2': 'O(log n)', '3': '   ', '4': 'Most recent entry comes out first.'}, {
        'evaluations': [{'questionId': 4, 'correct': True, 'explanation': 'Expresses the LIFO concept.'}], 'feedback': 'Review stream output.'
    })
    result = response.json()
    assert result['score'] == 50
    assert result['correctAnswers'] == 2
    assert result['incorrectAnswers'] == 2
    assert [item['correct'] for item in result['questionAnalysis']] == [False, True, False, True]
    assert result['questionAnalysis'][2]['explanation'] == 'No answer was provided.'


@pytest.mark.parametrize('evaluations', [
    [],
    [{'questionId': 2, 'correct': True, 'explanation': 'wrong id'}],
    [{'questionId': 1, 'correct': True, 'explanation': 'first'}, {'questionId': 1, 'correct': False, 'explanation': 'duplicate'}],
    [{'questionId': 1, 'correct': 'false', 'explanation': 'invalid boolean'}],
    [{'questionId': 1, 'correct': True, 'explanation': ' '}],
])
def test_invalid_grading_does_not_publish_a_wrong_score(evaluations):
    response, _ = submit([{'id': 1, 'question': 'Explain a stack', 'correctAnswer': 'LIFO'}], {'1': 'Last in first out'}, {'evaluations': evaluations, 'feedback': 'Feedback'})
    assert response.status_code == 503
    assert response.headers['retry-after'] == '10'
    assert 'score' not in response.json()


def test_fenced_grade_json_is_accepted():
    report = parse_report('```json\n{"evaluations":[{"questionId":1,"correct":true,"explanation":"Equivalent meaning."}],"feedback":"Good work."}\n```', [1])
    assert report.evaluations[0].correct is True


def test_malformed_grading_returns_retryable_error():
    with pytest.raises(HTTPException) as error:
        parse_report('This is not JSON', [1])
    assert error.value.status_code == 503
