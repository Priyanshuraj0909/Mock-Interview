import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mic, MicOff, Volume2, Upload, ArrowRight } from 'lucide-react';
import { generateInterview, evaluateAnswer, generateFollowUp, extractResume, getSession } from '../services/api';
import useAnswerDraft from '../hooks/useAnswerDraft';
import PracticeNav from './PracticeNav';
import InterviewReport from './InterviewReport';

export default function DashboardInterview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const [session, setSession] = useState(null);
  const [interviewType, setInterviewType] = useState('software_engineer');
  const [jobDescription, setJobDescription] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [difficultyLevel, setDifficultyLevel] = useState(3);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [reload, setReload] = useState(0);
  const recognition = useRef(null);
  const lock = useRef(false);
  const { answers, updateAnswer, flush, saveState } = useAnswerDraft(session);
  const question = session?.questions[index];
  const feedback = question && session.evaluations[question.id];
  const answer = question ? answers[question.id] || '' : '';
  const voiceTarget = useRef(null);
  voiceTarget.current = { question, updateAnswer };

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(Boolean(Recognition));
    if (!Recognition) return;
    const instance = new Recognition();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = 'en-US';
    instance.onend = () => setListening(false);
    instance.onerror = () => { setListening(false); setError('Voice input is unavailable. You can type your answer below.'); };
    recognition.current = instance;
    return () => { instance.abort(); window.speechSynthesis?.cancel(); };
  }, []);

  useEffect(() => {
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
    setListening(false);
  }, [question?.id]);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError('');
    getSession(sessionId).then(data => {
      if (!active) return;
      if (data.kind !== 'interview') throw new Error('This session is not an interview.');
      setSession(data);
      const next = data.questions.findIndex(q => !data.evaluations[q.id]);
      setIndex(next < 0 ? 0 : next);
      setShowReport(data.status === 'completed');
    }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, reload]);

  const generate = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError('');
    try {
      const data = await generateInterview(interviewType, jobDescription, difficultyLevel, resumeText);
      setSession(data); setIndex(0); setShowReport(false);
      setSearchParams({ session: data.sessionId }, { replace: true });
    } catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  };

  const upload = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Resume files must be 2 MB or smaller.'); return; }
    setUploading(true); setError('');
    try { const result = await extractResume(file); setResumeText(result.text); }
    catch (err) { setError(err.message); }
    finally { setUploading(false); event.target.value = ''; }
  };

  const submit = async () => {
    if (lock.current || !answer.trim()) return;
    lock.current = true;
    recognition.current?.stop(); setListening(false);
    setBusy(true); setError('');
    try {
      await flush();
      await evaluateAnswer(session.sessionId, question.id, answer);
      setSession(await getSession(session.sessionId));
    } catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  };

  const followUp = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await flush();
      const generated = await generateFollowUp(session.sessionId, question.id);
      const updated = await getSession(session.sessionId);
      setSession(updated); setIndex(updated.questions.findIndex(q => q.id === generated.id));
    } catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  };

  const toggleMic = () => {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    if (!recognition.current || !question) return;
    window.speechSynthesis?.cancel();
    const baseline = answer;
    const targetId = question.id;
    recognition.current.onresult = event => {
      if (voiceTarget.current?.question?.id !== targetId) return;
      const text = Array.from(event.results).map(result => result[0].transcript).join(' ');
      voiceTarget.current.updateAnswer(targetId, `${baseline}${baseline ? ' ' : ''}${text}`.slice(0, 12000));
    };
    try { recognition.current.start(); setListening(true); setError(''); }
    catch { setError('Microphone could not start. Please try again or type your answer.'); }
  };

  const next = () => {
    const nextIndex = session.questions.findIndex((q, i) => i > index && !session.evaluations[q.id]);
    if (nextIndex >= 0) setIndex(nextIndex);
    else {
      const remaining = session.questions.findIndex(q => !session.evaluations[q.id]);
      if (remaining >= 0) setIndex(remaining);
      else setShowReport(true);
    }
  };
  const reset = () => { setSession(null); setShowReport(false); setError(''); setSearchParams({}); };
  const canFollowUp = feedback && session.status !== 'completed' && session.questions.length < 8 && !question.parentId && !session.questions.some(q => q.parentId === question.id);
  const inputClass = 'w-full p-3 bg-gray-900 border border-gray-700 rounded-lg focus:border-blue-400';
  return <div className="min-h-screen bg-gray-950 text-gray-100"><PracticeNav title="Interview studio" />
    <main className="max-w-4xl mx-auto px-4 py-10">
      <p className="text-blue-300 text-sm uppercase tracking-widest mb-3">Prepare for your next opportunity</p>
      <h2 className="text-3xl font-semibold mb-3">Practice the conversation.</h2>
      <p className="text-gray-400 mb-8">Questions shaped around your role, feedback you can act on, and follow-ups that test your understanding.</p>
      {error && <div role="alert" className="mb-6 border border-red-900 bg-red-950/30 rounded-lg p-4"><p>{error}</p>
        {sessionId && !session && <button className="mt-3 underline" onClick={() => setReload(n => n + 1)}>Retry loading</button>}
      </div>}
      {loading ? <p role="status">Loading your interview…</p> : !session ? <section className="border border-gray-800 bg-gray-900/50 rounded-xl p-6 space-y-6">
        <div className="grid sm:grid-cols-2 gap-5">
          <label className="space-y-2"><span className="block text-sm text-gray-300">Target role</span><select className={inputClass} value={interviewType} onChange={e => setInterviewType(e.target.value)}>
            <option value="software_engineer">Software engineer</option><option value="frontend_developer">Frontend developer</option><option value="backend_developer">Backend developer</option><option value="fullstack_developer">Full-stack developer</option><option value="data_scientist">Data scientist</option>
          </select></label>
          <label className="space-y-2"><span className="block text-sm text-gray-300">Difficulty</span><select className={inputClass} value={difficultyLevel} onChange={e => setDifficultyLevel(Number(e.target.value))}>
            <option value={1}>Beginner</option><option value={2}>Intermediate</option><option value={3}>Advanced</option><option value={4}>Expert</option><option value={5}>Senior / lead</option>
          </select></label>
        </div>
        <label className="block space-y-2"><span className="text-sm text-gray-300">Job description · optional</span><textarea className={inputClass} rows={4} maxLength={15000} placeholder="Paste the role requirements…" value={jobDescription} onChange={e => setJobDescription(e.target.value)} /></label>
        <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><label htmlFor="resume-text" className="text-sm text-gray-300">Resume · optional</label>
          <label className="text-sm text-blue-300 flex items-center gap-2 cursor-pointer"><Upload size={16} />{uploading ? 'Reading resume…' : 'Upload PDF or text'}<input type="file" aria-label="Upload resume" className="sr-only" accept=".pdf,.txt,application/pdf,text/plain" disabled={uploading || busy} onChange={upload} /></label></div>
          <textarea id="resume-text" className={inputClass} rows={5} maxLength={20000} placeholder="Paste your skills, projects, and experience, or upload a resume…" value={resumeText} onChange={e => setResumeText(e.target.value)} />
          <p className="text-xs text-gray-500">PDF or UTF-8 text, up to 2 MB and 10 pages. Resume text is saved with this interview and sent to the AI provider to personalize questions.</p>
        </div>
        <button disabled={busy || uploading || Boolean(sessionId)} onClick={generate} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-5 py-3 flex items-center gap-2">{busy ? 'Preparing your interview…' : 'Generate interview'}<ArrowRight size={18} /></button>
      </section> : showReport ? <><InterviewReport session={session} /><button onClick={reset} className="mt-8 bg-blue-600 rounded-lg px-5 py-3">Start another interview</button></> : question && <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-6">
        <div className="flex justify-between flex-wrap gap-3 text-sm text-gray-400"><span>Question {index + 1} of {session.questions.length} · {question.topic}</span><span role="status">{saveState}</span></div>
        <h3 className="text-2xl leading-relaxed font-medium">{question.text}</h3>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy || listening || !window.speechSynthesis} className="rounded-lg border border-gray-700 px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-40" onClick={() => { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(question.text)); }}><Volume2 size={17} />Read question</button>
          {!feedback && <button disabled={!voiceSupported || busy} onClick={toggleMic} className="rounded-lg border border-gray-700 px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-40">{listening ? <MicOff size={17} /> : <Mic size={17} />}{listening ? 'Stop recording' : 'Use microphone'}</button>}
          {!voiceSupported && <span className="text-xs text-gray-500 self-center">Voice input is unavailable in this browser.</span>}
        </div>
        <label className="block"><span className="block text-sm text-gray-400 mb-2">Your answer</span><textarea className={inputClass} aria-label="Your answer" rows={8} maxLength={12000} disabled={busy || Boolean(feedback) || listening} value={answer} onChange={e => updateAnswer(question.id, e.target.value)} placeholder="Explain your reasoning and use examples…" /></label>
        {!feedback ? <button disabled={busy || !answer.trim()} onClick={submit} className="px-5 py-3 rounded-lg bg-blue-600 disabled:opacity-40">{busy ? 'Evaluating…' : 'Submit answer'}</button> : <div className="border-t border-gray-800 pt-6 space-y-4">
          <h4 className="font-medium text-lg">Feedback <span className="text-blue-300">{feedback.score}/10</span></h4><p className="text-gray-300">{feedback.feedback}</p>
          <h5 className="text-green-300 font-medium">Strengths</h5><ul className="list-disc pl-5 space-y-2 text-gray-300">{feedback.strengthPoints.map((tip, i) => <li key={i}>{tip}</li>)}</ul>
          <h5 className="text-blue-300 font-medium">What to improve</h5><ul className="list-disc pl-5 space-y-2 text-gray-300">{feedback.improvementPoints.map((tip, i) => <li key={i}>{tip}</li>)}</ul>
          <div className="flex flex-wrap gap-3 pt-3">{canFollowUp && <button disabled={busy} onClick={followUp} className="px-4 py-3 border border-blue-700 text-blue-300 rounded-lg disabled:opacity-40">{busy ? 'Preparing follow-up…' : 'Practice a follow-up'}</button>}
            <button disabled={busy} onClick={next} className="px-5 py-3 bg-blue-600 rounded-lg disabled:opacity-40">{session.status === 'completed' ? 'View report' : 'Next question'}</button></div>
        </div>}
      </section>}
    </main>
  </div>;
}
