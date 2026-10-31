import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const location = useLocation();
  useEffect(() => {
    const refresh = () => setToken(localStorage.getItem('token'));
    window.addEventListener('auth-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('auth-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return token ? children : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}
