import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';

import { API_BASE_URL } from '../services/api';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const navigate = useNavigate();

  // Check system preference on initial load
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true);
    } else {
      setDarkMode(false);
    }
  }, []);

  // Apply theme to document - fixed to include darkMode in dependency array
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]); // Added darkMode to the dependency array

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage('');
    setIsError(false);
    
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/signup`, {
        name, 
        email, 
        purpose, 
        password 
      });
      if (response.data.success) {
        setMessage(response.data.message);
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        localStorage.setItem('useremail', response.data.user.email);
        navigate('/dashboard');
      } else {
        setIsError(true);
        setMessage(response.data.message || 'Signup failed. Please try again.');
      }
      // Typically you would handle the successful signup here (e.g., redirect)
    } catch (error) {
      setIsError(true);
      setMessage(error.response?.data?.message || error.response?.data?.detail || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex min-h-screen items-center justify-center p-6 ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      
      <div className={`w-full max-w-md p-8 space-y-6 rounded-lg shadow-xl backdrop-blur-sm ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold">Sign Up</h2>
          <button 
            onClick={toggleDarkMode} 
            className={`p-2 rounded-full ${darkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-200 text-gray-700'}`}
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
        
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="name" className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full p-3 mt-1 rounded-md border ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' 
                  : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-600'
              } focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
                darkMode ? 'focus:ring-blue-500' : 'focus:ring-blue-600'
              }`}
              placeholder="Your name"
              required
            />
          </div>
          
          <div>
            <label htmlFor="email" className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full p-3 mt-1 rounded-md border ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' 
                  : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-600'
              } focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
                darkMode ? 'focus:ring-blue-500' : 'focus:ring-blue-600'
              }`}
              placeholder="your@email.com"
              required
            />
          </div>
          
          <div>
            <label htmlFor="purpose" className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Purpose
            </label>
            <select
              id="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className={`w-full p-3 mt-1 rounded-md border ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' 
                  : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-600'
              } focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
                darkMode ? 'focus:ring-blue-500' : 'focus:ring-blue-600'
              }`}
              required
            >
              <option value="" disabled>Select your purpose</option>
              <option value="personal">Personal Use</option>
              <option value="business">Business</option>
              <option value="education">Education</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="password" className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full p-3 mt-1 rounded-md border ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500' 
                  : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-600'
              } focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
                darkMode ? 'focus:ring-blue-500' : 'focus:ring-blue-600'
              }`}
              placeholder="********"
              minLength={8}
              maxLength={72}
              required
            />
            <p className={`mt-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Password must be at least 8 characters
            </p>
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-md text-white font-semibold transition-colors ${
                darkMode 
                  ? 'bg-blue-600 hover:bg-blue-700 focus:bg-blue-700' 
                  : 'bg-blue-700 hover:bg-blue-800 focus:bg-blue-800'
              } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </div>
        </form>
        
        <div className="text-center pt-2">
          <Link
            to="/login"
            className={`text-sm font-medium ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
          >
            Already have an account? Login
          </Link>
        </div>
        
        {message && (
          <div className={`mt-4 p-3 rounded-md text-center ${
            isError 
              ? darkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-700' 
              : darkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-700'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default Signup;
