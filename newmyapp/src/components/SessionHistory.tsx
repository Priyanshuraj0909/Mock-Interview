import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Clock, Target } from 'lucide-react';
import { listSessions, type SessionSummary } from '../services/api';
import PracticeNav from './PracticeNav';

export default function SessionHistory() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listSessions().then(data => { if (active) setSessions(data.sessions); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const completed = sessions.filter(s => s.status === 'completed');
  const scored = completed.filter(s => s.score !== null);
  const average = scored.length ? Math.round(scored.reduce((sum, s) => sum + (s.score || 0), 0) / scored.length) : null;
  const cards = [
    { label: 'Recent sessions', value: sessions.length, Icon: BookOpen },
    { label: 'Completed', value: completed.length, Icon: Target },
    { label: 'In progress', value: sessions.length - completed.length, Icon: Clock },
  ];
  return <div className="min-h-screen bg-gray-950 text-gray-100"><PracticeNav title="Your practice" />
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex flex-wrap justify-between items-end gap-6 mb-8"><div>
        <p className="text-blue-300 text-sm tracking-widest uppercase mb-3">Keep moving forward</p>
        <h2 className="text-3xl font-semibold mb-3">A little practice. A clearer next step.</h2>
        <p className="text-gray-400">Pick up where you left off or review your latest feedback.</p>
      </div><Link to="/dashboardmain" className="bg-blue-600 hover:bg-blue-500 rounded-lg px-5 py-3 inline-flex gap-2">New interview <ArrowUpRight size={20} /></Link></div>
      {loading ? <p role="status">Loading saved sessions…</p> : error ? <div role="alert" className="rounded-xl border border-red-900 p-5"><p>{error}</p><button onClick={() => setRetry(n => n + 1)} className="mt-3 underline">Try again</button></div> : <>
        <div className="grid sm:grid-cols-3 gap-4 mb-8">{cards.map(({ label, value, Icon }) => <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between text-gray-400 mb-3"><span>{label}</span><Icon size={20} /></div><p className="text-3xl font-semibold">{value}</p></div>)}</div>
        {average !== null && <p className="mb-6 text-gray-400">Average score across these completed sessions: <span className="text-blue-300">{average}%</span>. Scores combine mock tests and interview ratings; compare similar topics for meaningful trends.</p>}
        <div className="flex justify-between gap-4 mb-4"><h3 className="text-xl font-medium">Recent sessions</h3><span className="text-sm text-gray-500">Up to 30 latest sessions</span></div>
        {!sessions.length ? <div className="text-center p-12 border border-dashed border-gray-700 rounded-xl"><BookOpen className="mx-auto text-blue-300 mb-4" /><h3 className="text-xl mb-2">Your first session starts here.</h3><p className="text-gray-400 mb-6">Choose a timed test or an interview tailored to your target role.</p><Link className="text-blue-300 underline" to="/dashboard">Create a mock test</Link></div> :
          <div className="space-y-3">{sessions.map(s => <Link key={s.sessionId} to={`${s.kind === 'test' ? '/dashboard' : '/dashboardmain'}?session=${encodeURIComponent(s.sessionId)}`} className="flex flex-wrap gap-4 items-center justify-between p-5 bg-gray-900 border border-gray-800 hover:border-blue-700 rounded-xl">
            <div><span className="text-xs uppercase tracking-wide text-blue-300">{s.kind === 'test' ? 'Mock test' : 'Interview'}</span><h4 className="capitalize font-medium mt-1">{s.title}</h4><p className="text-sm text-gray-500 mt-1">{new Date(s.createdAt).toLocaleString()} · {s.answered}/{s.questionCount} answered</p></div>
            <div className="flex items-center gap-5"><span className="text-sm text-gray-300">{s.status === 'completed' ? `${s.score ?? 0}% · View report` : 'Continue practice'}</span><ArrowUpRight className="text-gray-500" size={20} /></div>
          </Link>)}</div>}
      </>}
    </main>
  </div>;
}
