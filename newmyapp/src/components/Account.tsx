import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import PracticeNav from './PracticeNav';
import { createRecoveryCode, deleteAccount, logout } from '../services/api';

export default function Account() {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function act(event: FormEvent, action: 'recover' | 'delete') {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (action === 'recover') setCode((await createRecoveryCode(password)).recoveryCode);
      else { await deleteAccount(password); logout(); navigate('/signup'); }
      setPassword('');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([`Mock Interview recovery code\n${code}\nKeep this private. It can reset your password once.\n`], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'mock-interview-recovery.txt'; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="min-h-screen bg-gray-950 text-gray-100"><PracticeNav title="Account settings" /><main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
    <h2 className="text-3xl font-semibold">Keep control of your account.</h2>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <form onSubmit={e => act(e, 'recover')} className="bg-gray-900 p-6 rounded-xl space-y-4">
      <h3 className="text-xl">Password recovery</h3><p className="text-gray-400">Create a private recovery code and save it somewhere safe. You will need it if you forget your password. A new code replaces the previous one.</p>
      <label className="block">Current password<input required type="password" autoComplete="current-password" maxLength={72} value={password} onChange={e => setPassword(e.target.value)} className="block w-full bg-gray-800 p-3 mt-2 rounded" /></label>
      <button disabled={busy} className="bg-blue-600 disabled:opacity-50 px-4 py-3 rounded">Create recovery code</button>
      {code && <div role="status" className="space-y-3"><p>Save this code now. It is only displayed here until you leave this page.</p><code className="block break-all bg-gray-800 p-3">{code}</code><button type="button" onClick={download} className="underline text-blue-300">Download code</button></div>}
    </form>
    <form onSubmit={e => act(e, 'delete')} className="border border-red-900 rounded-xl p-6 space-y-4"><h3 className="text-xl">Delete account and practice data</h3><p className="text-gray-400">Permanently remove your account, saved resumes, answers, and reports from the application database. This cannot be undone. Hosting backups and provider retention follow their own policies.</p>
      <label className="block">Current password<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="block w-full bg-gray-800 p-3 mt-2 rounded" /></label>
      <label className="block">Type DELETE to confirm<input value={confirmation} onChange={e => setConfirmation(e.target.value)} className="block w-full bg-gray-800 p-3 mt-2 rounded" /></label>
      <button disabled={busy || confirmation !== 'DELETE'} className="bg-red-800 disabled:opacity-40 rounded px-4 py-3">Permanently delete my account</button>
    </form>
  </main></div>;
}
