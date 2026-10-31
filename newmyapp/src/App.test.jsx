import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MockTest from './components/MockTest';
import { generateTest, getSession, saveAnswers, submitAnswers } from './services/api';

vi.mock('./services/api', () => ({ generateTest: vi.fn(), getSession: vi.fn(), saveAnswers: vi.fn(), submitAnswers: vi.fn() }));
const params = { purpose: 'Practice', subject: 'React', difficulty: 'medium', testType: 'conceptual', timeLimit: 30 };
const question = { id: 1, question: 'What is a component?', options: ['A reusable UI unit', 'A database'] };
const session = () => ({ sessionId: 'saved-test', kind: 'test', status: 'in_progress', revision: 0, params, questions: [question], answers: {}, evaluations: {}, deadlineAt: new Date(Date.now() + 1800000).toISOString() });
beforeEach(() => {
  vi.resetAllMocks();
  saveAnswers.mockResolvedValue({ revision: 1, saved: true });
});

test('preserves selected answers and retries submission using only a server session ID', async () => {
  generateTest.mockResolvedValue(session());
  submitAnswers.mockRejectedValueOnce(new Error('Service temporarily unavailable')).mockResolvedValueOnce({ score: 100 });
  const onComplete = vi.fn();
  render(<MockTest params={params} onComplete={onComplete} />);
  fireEvent.click(await screen.findByRole('button', { name: 'A reusable UI unit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Service temporarily unavailable');
  expect(screen.getByRole('button', { name: 'A reusable UI unit' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ score: 100 }));
  expect(submitAnswers.mock.calls[1][0]).toEqual({ sessionId: 'saved-test', answers: { 1: 'A reusable UI unit' } });
});

test('can retry generation after an API error', async () => {
  generateTest.mockRejectedValueOnce(new Error('AI is not configured')).mockResolvedValueOnce(session());
  render(<MockTest params={params} onComplete={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('AI is not configured');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(question.question)).toBeInTheDocument();
  expect(generateTest).toHaveBeenCalledTimes(2);
});

test('resumes saved answers instead of generating another test', async () => {
  getSession.mockResolvedValue({ ...session(), answers: { 1: 'A reusable UI unit' } });
  render(<MockTest sessionId="saved-test" onComplete={vi.fn()} />);
  expect(await screen.findByRole('button', { name: 'A reusable UI unit' })).toHaveAttribute('aria-pressed', 'true');
  expect(generateTest).not.toHaveBeenCalled();
});

test('autosaves selected answers', async () => {
  generateTest.mockResolvedValue(session());
  render(<MockTest params={params} onComplete={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'A reusable UI unit' }));
  await waitFor(() => expect(saveAnswers).toHaveBeenCalledWith('saved-test', { 1: 'A reusable UI unit' }, 0), { timeout: 2000 });
});

test('does not submit after an autosave conflict', async () => {
  generateTest.mockResolvedValue(session());
  saveAnswers.mockRejectedValue(Object.assign(new Error('Session changed in another tab'), { status: 409 }));
  render(<MockTest params={params} onComplete={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'A reusable UI unit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Session changed in another tab');
  expect(submitAnswers).not.toHaveBeenCalled();
});

test('React StrictMode does not generate two paid AI sessions', async () => {
  generateTest.mockResolvedValue(session());
  render(<StrictMode><MockTest params={params} onComplete={vi.fn()} /></StrictMode>);
  await screen.findByText(question.question);
  expect(generateTest).toHaveBeenCalledTimes(1);
});

test('flushes a recent answer when navigating away before the debounce', async () => {
  generateTest.mockResolvedValue(session());
  const { unmount } = render(<MockTest params={params} onComplete={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'A reusable UI unit' }));
  unmount();
  await waitFor(() => expect(saveAnswers).toHaveBeenCalledWith('saved-test', { 1: 'A reusable UI unit' }, 0));
});
