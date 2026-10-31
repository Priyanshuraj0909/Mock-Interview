import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PurposeForm from './PurposeForm';
import MockTest from './MockTest';
import Results from './Results';
import PracticeNav from './PracticeNav';

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [params, setParams] = useState(null);
  const [result, setResult] = useState(null);
  const sessionId = searchParams.get('session');
  const restart = () => { setParams(null); setResult(null); setSearchParams({}); };
  return <div className="min-h-screen bg-gray-950 text-gray-100">
    <PracticeNav title="Mock tests" />
    <main className="max-w-3xl mx-auto px-4 py-10">
      <p className="text-sm uppercase tracking-widest text-blue-300 mb-3">Practice with purpose</p>
      <h2 className="text-3xl font-semibold mb-3">Make your next attempt count.</h2>
      <p className="text-gray-400 mb-8">Choose a topic, practice at your pace, and review the reasoning behind each answer. Your sessions are saved to your account.</p>
      {result ? <Results data={result} onRestart={restart} /> : (params || sessionId) ?
        <MockTest params={params} sessionId={sessionId} onComplete={setResult}
          onSessionCreated={id => setSearchParams({ session: id }, { replace: true })} /> :
        <PurposeForm onSubmit={p => setParams({ ...p, timeLimit: Number(p.timeLimit) })} />}
    </main>
  </div>;
}
