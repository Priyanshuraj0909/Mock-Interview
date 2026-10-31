import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, History, LogOut } from 'lucide-react';
import { logout } from '../services/api';

export default function PracticeNav({ title }: { title: string }) {
  const navigate = useNavigate();
  return <header className="border-b border-gray-800 bg-gray-950/90 sticky top-0 z-20">
    <div className="max-w-6xl mx-auto p-4 flex flex-wrap gap-4 items-center justify-between">
      <Link to="/" className="text-blue-300 flex items-center gap-2"><ArrowLeft size={18} /> Mock Interview</Link>
      <h1 className="text-lg font-semibold">{title}</h1>
      <nav aria-label="Practice navigation" className="flex flex-wrap items-center gap-4 text-sm">
        <Link to="/dashboard" className="hover:text-blue-300">Mock tests</Link>
        <Link to="/dashboardmain" className="hover:text-blue-300">Interview studio</Link>
        <Link to="/history" className="flex items-center gap-1 hover:text-blue-300"><History size={16} /> History</Link>
        <button onClick={() => { logout(); navigate('/login'); }} className="flex items-center gap-1 text-gray-400 hover:text-white"><LogOut size={16} /> Sign out</button>
      </nav>
    </div>
  </header>;
}
