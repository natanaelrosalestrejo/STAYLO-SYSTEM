import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);

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
          setNetworkError(false);
        }).catch((err) => {
          if (err.response?.status === 401) {
            localStorage.removeItem('hotel_token');
            localStorage.removeItem('hotel_user');
            delete api.defaults.headers.common['Authorization'];
            setUser(null);
          } else if (!err.response) {
            setNetworkError(true);
          }
        });
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
    setNetworkError(false);
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
      {networkError && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 py-2 text-sm font-medium"
          style={{ background: '#d97706', color: '#fff', fontFamily: 'Montserrat, sans-serif' }}
        >
          <span>Sin conexión con el servidor — mostrando datos en caché</span>
          <button
            onClick={() => setNetworkError(false)}
            className="underline text-xs opacity-80 hover:opacity-100"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            Cerrar
          </button>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
