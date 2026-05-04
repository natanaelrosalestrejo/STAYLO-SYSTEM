import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('hotel_token');
    const savedUser = localStorage.getItem('hotel_user');
    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        // Refresh user from backend so effective modules (role permissions) are up to date
        api.get('/auth/me').then((r) => {
          const fresh = r.data;
          setUser(fresh);
          localStorage.setItem('hotel_user', JSON.stringify(fresh));
        }).catch(() => {});
      } catch (e) {
        localStorage.removeItem('hotel_token');
        localStorage.removeItem('hotel_user');
      }
    }
    setLoading(false);

    const interceptor = api.interceptors.response.use(
      r => r,
      err => {
        if (err.response?.status === 401 && localStorage.getItem('hotel_token')) {
          localStorage.removeItem('hotel_token');
          localStorage.removeItem('hotel_user');
          delete api.defaults.headers.common['Authorization'];
          setUser(null);
          window.location.href = '/login';
        }
        return Promise.reject(err);
      }
    );
    return () => api.interceptors.response.eject(interceptor);
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('hotel_token', token);
    localStorage.setItem('hotel_user', JSON.stringify(userData));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('hotel_token');
    localStorage.removeItem('hotel_user');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    setUser(updated);
    localStorage.setItem('hotel_user', JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
