import { useCallback, useEffect, useRef, useState } from 'react';
import { saveAnswers, type PracticeSession } from '../services/api';

type DraftContext = {
  id: string;
  revision: number;
  completed: boolean;
  answers: Record<string, string>;
  saved: string;
  blocked: boolean;
  queue: Promise<void>;
};

export default function useAnswerDraft(session: PracticeSession | null) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState('Saved');
  const context = useRef<DraftContext | null>(null);

  // Every queued operation keeps its own session context, even after route changes.
  const flushContext = useCallback((draft: DraftContext | null) => {
    if (!draft) return Promise.resolve();
    const next = draft.queue.catch(() => {}).then(async () => {
      if (draft.completed || draft.saved === JSON.stringify(draft.answers)) return;
      if (draft.blocked) throw new Error('This session changed in another tab. Reload before continuing.');
      const snapshot = { ...draft.answers };
      if (context.current === draft) setSaveState('Saving…');
      try {
        const result = await saveAnswers(draft.id, snapshot, draft.revision);
        draft.revision = result.revision;
        draft.saved = JSON.stringify(snapshot);
        if (context.current === draft) setSaveState(draft.saved === JSON.stringify(draft.answers) ? 'Saved' : 'Unsaved changes');
      } catch (error) {
        if ((error as { status?: number }).status === 409) draft.blocked = true;
        if (context.current === draft) setSaveState(draft.blocked ? 'Session changed in another tab. Reload to continue.' : 'Could not save. Keep this page open and retry.');
        throw error;
      }
    });
    draft.queue = next;
    return next;
  }, []);

  useEffect(() => {
    if (!session) { context.current = null; return; }
    const draft: DraftContext = { id: session.sessionId, revision: session.revision,
      completed: session.status === 'completed', answers: session.answers,
      saved: JSON.stringify(session.answers), blocked: false, queue: Promise.resolve() };
    context.current = draft;
    setAnswers(draft.answers);
    setSaveState('Saved');
    return () => { void flushContext(draft).catch(() => {}); };
  }, [session, flushContext]);

  const updateAnswer = useCallback((questionId: number, answer: string) => {
    const draft = context.current;
    if (!draft || draft.completed) return;
    draft.answers = { ...draft.answers, [questionId]: answer };
    setAnswers(draft.answers);
    setSaveState('Unsaved changes');
  }, []);
  const flush = useCallback(() => flushContext(context.current), [flushContext]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void flush().catch(() => {}); }, 800);
    return () => clearTimeout(timer);
  }, [answers, flush]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      const draft = context.current;
      if (draft && draft.saved !== JSON.stringify(draft.answers)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);

  return { answers, updateAnswer, flush, saveState };
}
