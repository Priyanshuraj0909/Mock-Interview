import { useState, useEffect, useCallback, useRef } from 'react';
import { generateTest, getSession, submitAnswers } from '../services/api';
import useAnswerDraft from '../hooks/useAnswerDraft';

export default function MockTest({ params, sessionId, onComplete, onSessionCreated }) {
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  const timedOut = useRef(false);
  const requestRef = useRef(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const createdRef = useRef(onSessionCreated);
  createdRef.current = onSessionCreated;
  const { answers, updateAnswer, flush, saveState } = useAnswerDraft(session);

  useEffect(() => {
    let cancelled = false;
    const signature = JSON.stringify([sessionId, params, reload]);
    if (requestRef.current?.signature !== signature) {
      requestRef.current = { signature, promise: sessionId ? getSession(sessionId) : generateTest(params) };
    }
    setLoading(true);
    setError(null);
    requestRef.current.promise.then(response => {
      if (cancelled) return;
      if (response.kind !== 'test' || !response.questions?.length) throw new Error('This is not a valid test session.');
      if (response.result) { completeRef.current(response.result); return; }
      setSession(response);
      if (!sessionId) createdRef.current?.(response.sessionId);
    }).catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params, sessionId, reload]);

  const handleSubmit = useCallback(async () => {
    if (lock.current || !session) return;
    lock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await flush();
      const result = await submitAnswers({ sessionId: session.sessionId, answers });
      completeRef.current(result);
    } catch (err) {
      setError(err.message || 'Failed to submit answers. Please retry.');
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }, [session, answers, flush]);

  useEffect(() => {
    if (!session?.deadlineAt) return;
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((Date.parse(session.deadlineAt) - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session?.deadlineAt]);

  useEffect(() => {
    if (timeLeft === 0 && session && !timedOut.current) {
      timedOut.current = true;
      void handleSubmit();
    }
  }, [timeLeft, session, handleSubmit]);

  if (loading) return <p role="status" className="p-8 text-center text-blue-300">Loading your test…</p>;
  if (!session) return <div className="p-6"><p role="alert" className="text-red-300">{error || 'No questions available.'}</p>
    <button className="mt-4 px-4 py-2 rounded bg-blue-600" onClick={() => setReload(v => v + 1)}>Try again</button></div>;
  const question = session.questions[currentQuestion];
  const minutes = Math.floor((timeLeft ?? 0) / 60);
  const seconds = String((timeLeft ?? 0) % 60).padStart(2, '0');
  return <section className="bg-gray-900 p-6 rounded-xl border border-gray-800">
    {error && <div role="alert" className="mb-4 p-3 bg-red-950 text-red-200 rounded"><p>{error}</p>
      <button className="underline mt-2" disabled={submitting} onClick={handleSubmit}>Retry submission</button></div>}
    <div className="flex flex-wrap justify-between gap-3 text-sm text-gray-400 mb-6">
      <span>Question {currentQuestion + 1} of {session.questions.length}</span>
      <span role="status">{saveState}</span><span>Time left: {minutes}:{seconds}</span>
    </div>
    <h3 className="text-xl font-medium mb-6">{question.question}</h3>
    {question.options?.length ? <div className="space-y-3">{question.options.map(opt =>
      <button type="button" aria-pressed={answers[question.id] === opt} disabled={submitting || timeLeft === 0} key={opt}
        className={`w-full text-left p-4 rounded-lg border ${answers[question.id] === opt ? 'bg-blue-900 border-blue-400' : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}
        onClick={() => updateAnswer(question.id, opt)}>{opt}</button>)}</div> :
      <textarea className="w-full bg-gray-800 p-4 rounded-lg border border-gray-700 focus:border-blue-400" placeholder="Type your answer…"
        aria-label="Your answer" disabled={submitting || timeLeft === 0} rows={8} maxLength={12000}
        value={answers[question.id] || ''} onChange={e => updateAnswer(question.id, e.target.value)} />}
    <div className="flex justify-between gap-4 mt-6">
      <button className="px-4 py-2 rounded bg-gray-800 disabled:opacity-40" disabled={currentQuestion === 0 || submitting} onClick={() => setCurrentQuestion(q => q - 1)}>Previous</button>
      {currentQuestion < session.questions.length - 1 ?
        <button className="px-4 py-2 rounded bg-blue-600" disabled={submitting} onClick={() => setCurrentQuestion(q => q + 1)}>Next</button> :
        <button className="px-4 py-2 rounded bg-green-700 disabled:opacity-40" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Test'}</button>}
    </div>
  </section>;
}
