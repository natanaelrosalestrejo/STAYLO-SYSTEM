import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from './AuthContext';

const PropertyContext = createContext(null);

export const PropertyProvider = ({ children }) => {
  const { user } = useAuth();
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    () => localStorage.getItem('selectedPropertyId') || 'all'
  );

  useEffect(() => {
    if (!user) return;
    api.get('/properties').then(res => {
      setProperties(res.data);
    }).catch(() => {});
  }, [user]);

  const selectProperty = (id) => {
    setSelectedPropertyId(id);
    localStorage.setItem('selectedPropertyId', id);
  };

  const selectedProperty = properties.find(p => p.id === selectedPropertyId) || null;

  return (
    <PropertyContext.Provider value={{ properties, selectedPropertyId, selectedProperty, selectProperty }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => useContext(PropertyContext);
