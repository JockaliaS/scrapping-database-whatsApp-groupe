import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export default function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('radar_user'));
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('radar_token'));
  const navigate = useNavigate();

  const isAuthenticated = !!token;

  const loginUser = useCallback(
    (tokenValue, userData) => {
      localStorage.setItem('radar_token', tokenValue);
      localStorage.setItem('radar_user', JSON.stringify(userData));
      setToken(tokenValue);
      setUser(userData);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem('radar_token');
    localStorage.removeItem('radar_user');
    setToken(null);
    setUser(null);
    navigate('/login');
  }, [navigate]);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'radar_token' && !e.newValue) {
        setToken(null);
        setUser(null);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return { user, token, isAuthenticated, loginUser, logout };
}
