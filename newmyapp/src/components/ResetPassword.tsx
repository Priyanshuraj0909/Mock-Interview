import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword, logout } from '../services/api';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await resetPassword(email, code.trim(), password); logout(); setDone(true); setCode(''); setPassword(''); }
    catch (err) { setMessage((err as Error).message); } finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-gray-950 text-gray-100 flex justify-center items-center p-4"><div className="max-w-md w-full bg-gray-900 p-8 rounded-xl space-y-5"><h1 className="text-2xl">Reset your password</h1>
    {done ? <p role="status">Password changed. Your recovery code has been used and previous sessions have been revoked. Sign in and create a new code in Account settings.</p> : <form onSubmit={submit} className="space-y-4"><p className="text-gray-400">Use the recovery code you saved from Account settings. Email-based recovery is not available.</p>
      {message && <p role="alert" className="text-red-300">{message}</p>}
      <label className="block">Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="block bg-gray-800 p-3 rounded w-full mt-2" /></label>
      <label className="block">Recovery code<input required value={code} onChange={e => setCode(e.target.value)} autoComplete="off" className="block bg-gray-800 p-3 rounded w-full mt-2" /></label>
      <label className="block">New password<input type="password" minLength={8} maxLength={72} required value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" className="block bg-gray-800 p-3 rounded w-full mt-2" /></label>
      <button disabled={busy} className="bg-blue-600 rounded px-4 py-3 disabled:opacity-50">{busy ? 'Resetting…' : 'Reset password'}</button>
    </form>}<Link to="/login" className="block text-blue-300 underline">Return to sign in</Link></div></main>;
}
