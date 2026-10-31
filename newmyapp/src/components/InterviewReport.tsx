import type { PracticeSession } from '../services/api';

export default function InterviewReport({ session }: { session: PracticeSession }) {
  const answered = session.questions.filter(q => session.evaluations[q.id]);
  const average = answered.length ? answered.reduce((sum, q) => sum + session.evaluations[q.id].score, 0) / answered.length : 0;
  const topics = new Map<string, { total: number; count: number; tips: string[] }>();
  answered.forEach(q => {
    const grade = session.evaluations[q.id];
    const topic = q.topic || 'Technical knowledge';
    const entry = topics.get(topic) || { total: 0, count: 0, tips: [] };
    entry.total += grade.score;
    entry.count += 1;
    entry.tips.push(...grade.improvementPoints);
    topics.set(topic, entry);
  });
  const ranked = [...topics].sort((a, b) => a[1].total / a[1].count - b[1].total / b[1].count);
  return <section className="space-y-8">
    <div className="rounded-xl border border-blue-900 bg-blue-950/30 p-6">
      <p className="text-sm text-blue-300 mb-2">Your practice report</p>
      <h2 className="text-3xl font-semibold">{average.toFixed(1)}<span className="text-lg text-gray-400"> / 10</span></h2>
      <p className="mt-2 text-gray-400">Based on {answered.length} evaluated answers. AI feedback is a practice aid; review technical claims before relying on them.</p>
    </div>
    <div>
      <h3 className="text-xl font-semibold mb-4">Where to focus next</h3>
      <div className="grid gap-4 sm:grid-cols-2">{ranked.slice(0, 4).map(([topic, entry]) => {
        const score = entry.total / entry.count;
        return <article key={topic} className="rounded-xl border border-gray-800 p-5 bg-gray-900">
          <div className="flex justify-between gap-3 mb-3"><h4 className="font-medium">{topic}</h4><span className="text-blue-300">{score.toFixed(1)}/10</span></div>
          <div role="meter" aria-label={topic} aria-valuenow={score} aria-valuemin={0} aria-valuemax={10} className="h-2 bg-gray-800 rounded-full mb-4"><div className="h-full bg-blue-400 rounded-full" style={{ width: `${score * 10}%` }} /></div>
          <p className="text-sm text-gray-400">{entry.tips[0]}</p>
          <p className="text-sm text-blue-200 mt-3">Next practice: explain this concept, work through an example, then revisit your answer.</p>
        </article>;
      })}</div>
    </div>
    <div className="space-y-4"><h3 className="text-xl font-semibold">Answers and feedback</h3>
      {answered.map(q => <details key={q.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <summary className="cursor-pointer font-medium">{q.text} <span className="text-blue-300">({session.evaluations[q.id].score}/10)</span></summary>
        <p className="mt-4 text-sm text-gray-500">Your answer</p><p className="whitespace-pre-wrap mt-1">{session.answers[q.id]}</p>
        <p className="mt-4 text-gray-300">{session.evaluations[q.id].feedback}</p>
        <h4 className="mt-4 text-green-300 font-medium">Strengths</h4><ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-gray-300">{session.evaluations[q.id].strengthPoints.map((tip, i) => <li key={i}>{tip}</li>)}</ul>
        <h4 className="mt-4 text-blue-300 font-medium">Improvements</h4><ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-gray-300">{session.evaluations[q.id].improvementPoints.map((tip, i) => <li key={i}>{tip}</li>)}</ul>
      </details>)}
    </div>
  </section>;
}
