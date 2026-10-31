import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardInterview from './DashboardInterview';
import { getSession, evaluateAnswer, saveAnswers, generateFollowUp } from '../services/api';

vi.mock('../services/api', () => ({
  getSession: vi.fn(), evaluateAnswer: vi.fn(), saveAnswers: vi.fn(), generateFollowUp: vi.fn(),
  generateInterview: vi.fn(), extractResume: vi.fn(), logout: vi.fn(),
}));
const feedback = { score: 6, feedback: 'Good start.', strengthPoints: ['Understands state'], improvementPoints: ['Explain effect cleanup'] };
const question = { id: 1, text: 'Explain React hooks', topic: 'React hooks' };
const session = { sessionId: 'interview-1', kind: 'interview', status: 'in_progress', revision: 0,
  params: { interviewType: 'frontend_developer' }, questions: [question, { id: 2, text: 'Explain closures', topic: 'JavaScript' }], answers: {}, evaluations: {} };
const renderInterview = () => render(<MemoryRouter initialEntries={['/dashboardmain?session=interview-1']}><DashboardInterview /></MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks();
  saveAnswers.mockResolvedValue({ revision: 1 });
});

test('renders backend improvementPoints and strengths after grading', async () => {
  getSession.mockResolvedValueOnce(session).mockResolvedValueOnce({ ...session, revision: 2, answers: { 1: 'Hooks manage state' }, evaluations: { 1: feedback } });
  evaluateAnswer.mockResolvedValue(feedback);
  renderInterview();
  const input = await screen.findByRole('textbox', { name: 'Your answer' });
  fireEvent.change(input, { target: { value: 'Hooks manage state' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
  expect(await screen.findByText('Explain effect cleanup')).toBeInTheDocument();
  expect(screen.getByText('Understands state')).toBeInTheDocument();
  expect(evaluateAnswer).toHaveBeenCalledWith('interview-1', 1, 'Hooks manage state');
});

test('adds and selects an adaptive follow-up', async () => {
  const evaluated = { ...session, revision: 1, answers: { 1: 'An answer' }, evaluations: { 1: feedback } };
  const follow = { id: 3, text: 'How do you clean up subscriptions?', topic: 'React hooks', parentId: 1 };
  // Load question 1 as the only remaining item, then grade it with question 2 still available.
  getSession.mockResolvedValueOnce(session).mockResolvedValueOnce(evaluated).mockResolvedValueOnce({ ...evaluated, revision: 2, questions: [question, follow, session.questions[1]] });
  evaluateAnswer.mockResolvedValue(feedback);
  generateFollowUp.mockResolvedValue(follow);
  renderInterview();
  fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), { target: { value: 'An answer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Practice a follow-up' }));
  expect(await screen.findByText(follow.text)).toBeInTheDocument();
  expect(generateFollowUp).toHaveBeenCalledWith('interview-1', 1);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue(''));
});
