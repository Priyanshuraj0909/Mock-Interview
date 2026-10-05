import { render, screen, fireEvent } from '@testing-library/react';
import MockTest from './components/MockTest';
import { generateTest, submitAnswers } from './services/api';

jest.mock('./services/api', () => ({ generateTest: jest.fn(), submitAnswers: jest.fn() }));
const params = { purpose: 'Practice', subject: 'React', difficulty: 'medium', testType: 'conceptual', timeLimit: 30 };
const question = { id: 1, question: 'What is a component?', options: ['A reusable UI unit', 'A database'] };
beforeEach(() => jest.resetAllMocks());

test('preserves selected answers and allows retry after a failed submission', async () => {
  generateTest.mockResolvedValue({ questions: [question] });
  submitAnswers.mockRejectedValueOnce(new Error('Service temporarily unavailable')).mockResolvedValueOnce({ score: 100 });
  const onComplete = jest.fn();
  render(<MockTest params={params} onComplete={onComplete} />);
  fireEvent.click(await screen.findByRole('button', { name: 'A reusable UI unit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Service temporarily unavailable');
  expect(screen.getByRole('button', { name: 'A reusable UI unit' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }));
  await screen.findByRole('button', { name: 'Submit Test' });
  expect(onComplete).toHaveBeenCalledWith({ score: 100 });
  expect(submitAnswers.mock.calls[1][0].answers).toEqual({ 1: 'A reusable UI unit' });
});

test('can retry question generation after an API error', async () => {
  generateTest.mockRejectedValueOnce(new Error('AI is not configured')).mockResolvedValueOnce({ questions: [question] });
  render(<MockTest params={params} onComplete={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('AI is not configured');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(question.question)).toBeInTheDocument();
  expect(generateTest).toHaveBeenCalledTimes(2);
});
