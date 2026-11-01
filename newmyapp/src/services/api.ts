declare const __API_BASE_URL__: string;
export const API_BASE_URL = __API_BASE_URL__.replace(/\/$/, '');

export interface Feedback {
  feedback: string;
  score: number;
  strengthPoints: string[];
  improvementPoints: string[];
}
export interface Question {
  id: number;
  question?: string;
  text?: string;
  topic?: string;
  options?: string[];
  parentId?: number;
}
export interface TestParams {
  purpose: string;
  subject: string;
  difficulty: string;
  testType: string;
  timeLimit: number;
}
export interface TestResult {
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  feedback: string;
  questionAnalysis: { question: string; userAnswer: string; correctAnswer: string; correct: boolean; explanation: string }[];
}
export interface PracticeSession {
  sessionId: string;
  kind: 'test' | 'interview';
  status: 'in_progress' | 'completed';
  questions: Question[];
  params: TestParams & { interviewType?: string; jobDescription?: string; difficultyLevel?: number };
  answers: Record<string, string>;
  evaluations: Record<string, Feedback>;
  revision: number;
  createdAt: string;
  deadlineAt?: string;
  result?: TestResult;
}
export interface SessionSummary {
  sessionId: string;
  kind: 'test' | 'interview';
  status: string;
  title: string;
  createdAt: string;
  score: number | null;
  answered: number;
  questionCount: number;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function logout() {
  void fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
  ['token', 'user', 'useremail'].forEach(key => localStorage.removeItem(key));
  window.dispatchEvent(new Event('auth-changed'));
}

let refreshInFlight: Promise<boolean> | null = null;
async function renewSession(): Promise<boolean> {
  if (!refreshInFlight) refreshInFlight = fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async response => {
      if (!response.ok) return false;
      const data = await response.json();
      localStorage.setItem('token', data.token);
      window.dispatchEvent(new Event('auth-changed'));
      return true;
    }).catch(() => false).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const canRefresh = !['/auth/login', '/auth/signup', '/auth/reset-password', '/auth/refresh', '/auth/logout'].includes(path);
    if (response.status === 401 && canRefresh) {
      if (retry && await renewSession()) return apiRequest<T>(path, init, false);
      logout();
    }
    const detail = typeof body.detail === 'string' ? body.detail : body.message;
    throw new ApiError(detail || (response.status === 422 ? 'Please check your input and try again.' : 'The request failed. Please try again.'), response.status);
  }
  return body as T;
}

const post = <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const generateTest = (params: TestParams) => post<PracticeSession>('/generate-test', params);
export const submitAnswers = (data: { sessionId: string; answers: Record<string, string> }) => post<TestResult>('/submit-answers', data);
export const getSession = (id: string) => apiRequest<PracticeSession>(`/sessions/${encodeURIComponent(id)}`);
export const listSessions = () => apiRequest<{ sessions: SessionSummary[] }>('/sessions');
export const saveAnswers = (id: string, answers: Record<string, string>, revision: number) =>
  apiRequest<{ revision: number; saved: boolean }>(`/sessions/${encodeURIComponent(id)}/answers`, { method: 'PATCH', body: JSON.stringify({ answers, revision }) });
export const generateInterview = (interviewType: string, jobDescription: string, difficultyLevel: number, resumeText: string) =>
  post<PracticeSession>('/interview/generate-questions', { interviewType, jobDescription, difficultyLevel, resumeText });
export const evaluateAnswer = (sessionId: string, questionId: number, answer: string) =>
  post<Feedback>('/interview/evaluate-answer', { sessionId, questionId, answer });
export const generateFollowUp = (sessionId: string, questionId: number) =>
  post<Question>('/interview/follow-up', { sessionId, questionId });
export const extractResume = (file: File) => apiRequest<{ text: string; characters: number }>('/resume/extract', {
  method: 'POST', headers: { 'Content-Type': file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/plain' }, body: file,
});

export interface ProgressReport {
  sessionsScanned: number;
  repeatedQuestionsExcluded: number;
  note: string;
  topics: { group: string; topic: string; score: number; uniqueQuestions: number; suggestion: string }[];
  trends: { sessionId: string; group: string; date: string; score: number; completed: boolean }[];
}
export const getProgress = () => apiRequest<ProgressReport>('/analytics');
export const createRecoveryCode = (password: string) => post<{ recoveryCode: string }>('/auth/recovery-code', { password });
export const resetPassword = (email: string, recoveryCode: string, password: string) => post('/auth/reset-password', { email, recoveryCode, password });
export const deleteAccount = (password: string) => post('/auth/delete-account', { password });
