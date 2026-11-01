import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PracticeNav from './PracticeNav';
import { getProgress, type ProgressReport } from '../services/api';

export default function Progress() {
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [group, setGroup] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    getProgress().then(data => { if (active) setReport(data); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [retry]);
  const groups = [...new Set(report?.trends.map(row => row.group) || [])];
  const selected = group || groups[0];
  const trends = report?.trends.filter(row => row.group === selected) || [];
  return <div className="min-h-screen bg-gray-950 text-gray-100"><PracticeNav title="Your progress" />
    <main className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <h2 className="text-3xl font-semibold">Find your next practice priority.</h2>
      {error ? <div role="alert">{error}<button className="ml-4 underline" onClick={() => setRetry(n => n + 1)}>Try again</button></div> : !report ? <p role="status">Loading progress…</p> : <>
        <p className="text-gray-400">Based on your latest {report.sessionsScanned} sessions (up to 100). {report.repeatedQuestionsExcluded} repeated questions excluded from topic evidence.</p>
        {!groups.length ? <p>Complete a graded answer to begin. <Link className="text-blue-300 underline" to="/dashboardmain">Start an interview</Link></p> : <>
          <label className="block">Compare similar sessions<select className="block bg-gray-800 p-3 mt-2 rounded w-full" value={selected} onChange={e => setGroup(e.target.value)}>{groups.map(item => <option key={item}>{item}</option>)}</select></label>
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5"><h3 className="text-xl mb-4">Score history</h3>
            <ol className="space-y-3">{trends.map(item => <li key={item.sessionId} className="grid grid-cols-[6rem_1fr_3rem] gap-3 items-center"><span className="text-sm text-gray-400">{new Date(item.date).toLocaleDateString()} {item.completed ? '' : '(partial)'}</span><meter aria-label={`Score on ${new Date(item.date).toLocaleDateString()}`} min="0" max="100" value={item.score} className="w-full h-6" /><span>{item.score}%</span></li>)}</ol>
          </section>
          <section><h3 className="text-xl mb-4">Topic priorities</h3><div className="grid sm:grid-cols-2 gap-4">{report.topics.filter(row => row.group === selected).map(row => <article key={row.topic} className="p-5 rounded-xl bg-gray-900 border border-gray-800"><h4 className="capitalize text-lg">{row.topic}</h4><p className="text-blue-300 my-2">{row.score}% · {row.uniqueQuestions} distinct questions</p><p className="text-gray-400">{row.suggestion}</p></article>)}</div>{!report.topics.some(row => row.group === selected) && <p className="text-gray-400">Topic evidence is available for interview answers. Mock tests currently show session scores.</p>}</section>
        </>}
        <p className="text-sm text-gray-500">{report.note}</p>
      </>}
    </main></div>;
}
