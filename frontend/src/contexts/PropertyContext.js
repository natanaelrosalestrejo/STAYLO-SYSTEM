import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from './AuthContext';
import { getAssignedPropertyIds } from '../utils/propertyScope';

const PropertyContext = createContext(null);

export const PropertyProvider = ({ children }) => {
  const { user } = useAuth();
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    () => localStorage.getItem('selectedPropertyId') || 'all'
  );

  const allowedIdsFromUser = useMemo(() => getAssignedPropertyIds(user), [user]);

  useEffect(() => {
    if (!user) return;
    api.get('/properties').then(res => setProperties(res.data || [])).catch(() => {});
  }, [user]);

  // Drop selection that is not in the visible (backend-scoped) property list.
  useEffect(() => {
    if (!properties.length) return;
    if (selectedPropertyId === 'all') return;
    const ok = properties.some((p) => p.id === selectedPropertyId);
    if (!ok) {
      const fallback =
        allowedIdsFromUser.length === 1 && properties.some((p) => p.id === allowedIdsFromUser[0])
          ? allowedIdsFromUser[0]
          : 'all';
      setSelectedPropertyId(fallback);
      localStorage.setItem('selectedPropertyId', fallback);
    }
  }, [properties, selectedPropertyId, allowedIdsFromUser]);

  // Single assigned property: prefer concrete id over stale "all" in localStorage.
  useEffect(() => {
    if (!user || !properties.length) return;
    if (allowedIdsFromUser.length !== 1) return;
    const only = allowedIdsFromUser[0];
    if (!properties.some((p) => p.id === only)) return;
    if (selectedPropertyId !== only) {
      setSelectedPropertyId(only);
      localStorage.setItem('selectedPropertyId', only);
    }
  }, [user, properties, allowedIdsFromUser, selectedPropertyId]);

  const selectProperty = (id) => {
    setSelectedPropertyId(id);
    localStorage.setItem('selectedPropertyId', id);
  };

  const selectedProperty = properties.find(p => p.id === selectedPropertyId) || null;

  return (
    <PropertyContext.Provider value={{ properties, selectedPropertyId, selectedProperty, selectProperty, allowedIdsFromUser }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => useContext(PropertyContext);
