import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import WelcomePage from './components/WelcomePage';
import HomePage from './components/HomePage';
import Login from './components/Login';
import Signup from './components/SignUp';
import DashboardInterview from './components/DashboardInterview';
import ProtectedRoute from './components/ProtectedRoute';
import SessionHistory from './components/SessionHistory';
import Progress from './components/Progress';
import Account from './components/Account';
import ResetPassword from './components/ResetPassword';

const protect = element => <ProtectedRoute>{element}</ProtectedRoute>;
const router = createBrowserRouter([
  { path: '/', element: <WelcomePage /> },
  { path: '/dashboard', element: protect(<HomePage />) },
  { path: '/dashboardmain', element: protect(<DashboardInterview />) },
  { path: '/history', element: protect(<SessionHistory />) },
  { path: '/progress', element: protect(<Progress />) },
  { path: '/account', element: protect(<Account />) },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  { path: '*', element: <div className="p-10 text-center"><h1>Page not found</h1><a href="/">Return home</a></div> },
]);

export default function App() { return <RouterProvider router={router} />; }
