import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Progress from './Progress';
import Account from './Account';
import ResetPassword from './ResetPassword';
import { getProgress, createRecoveryCode, deleteAccount, resetPassword } from '../services/api';

vi.mock('../services/api', () => ({ getProgress: vi.fn(), createRecoveryCode: vi.fn(), deleteAccount: vi.fn(), resetPassword: vi.fn(), logout: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const show = component => render(<MemoryRouter>{component}</MemoryRouter>);

test('filters progress to comparable sessions and shows evidence counts', async () => {
  getProgress.mockResolvedValue({ sessionsScanned: 3, repeatedQuestionsExcluded: 1, note: 'Not a mastery measure.', topics: [{ group: 'interview: frontend · 2', topic: 'hooks', score: 60, uniqueQuestions: 2, suggestion: 'Practice this topic next' }], trends: [{ sessionId: 'a', group: 'interview: frontend · 2', date: '2026-01-01', score: 60, completed: true }, { sessionId: 'b', group: 'test: Python · easy', date: '2026-01-02', score: 90, completed: true }] });
  show(<Progress />);
  expect(await screen.findByText('hooks')).toBeInTheDocument();
  expect(screen.getByText('60% · 2 distinct questions')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test: Python · easy' } });
  expect(screen.queryByText('hooks')).not.toBeInTheDocument();
  expect(screen.getByText('90%')).toBeInTheDocument();
});

test('recovery code creation requires a password and deletion requires explicit confirmation', async () => {
  createRecoveryCode.mockResolvedValue({ recoveryCode: 'private-recovery-code' });
  show(<Account />);
  expect(screen.getByRole('button', { name: 'Permanently delete my account' })).toBeDisabled();
  fireEvent.change(screen.getAllByLabelText('Current password')[0], { target: { value: 'my-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create recovery code' }));
  expect(await screen.findByText('private-recovery-code')).toBeInTheDocument();
  expect(createRecoveryCode).toHaveBeenCalledWith('my-password');
  expect(deleteAccount).not.toHaveBeenCalled();
});

test('password reset surfaces a rejected recovery code without losing input', async () => {
  resetPassword.mockRejectedValue(new Error('Email or recovery code is invalid.'));
  show(<ResetPassword />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'saved-recovery-code' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or recovery code is invalid.');
  expect(screen.getByLabelText('Recovery code')).toHaveValue('saved-recovery-code');
});
