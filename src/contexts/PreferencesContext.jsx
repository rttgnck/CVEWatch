import React, { createContext, useContext, useState, useEffect } from 'react';

const PreferencesContext = createContext();

const defaultPreferences = {
  products: [],
  pollInterval: 30,
  notifications: true
};

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        if (window.electronAPI) {
          const prefs = await window.electronAPI.getPreferences();
          setPreferences(prefs || defaultPreferences);
        }
      } catch (err) {
        console.error('Failed to load preferences:', err);
      }
      setIsLoading(false);
    };

    loadPreferences();
  }, []);

  const updatePreference = async (key, value) => {
    try {
      if (window.electronAPI) {
        const updatedPrefs = await window.electronAPI.setPreference(key, value);
        setPreferences(updatedPrefs);
      } else {
        setPreferences(prev => ({ ...prev, [key]: value }));
      }
    } catch (err) {
      console.error('Failed to update preference:', err);
    }
  };

  const addProduct = async (product) => {
    const newProducts = [...(preferences.products || []), product];
    await updatePreference('products', newProducts);
  };

  const removeProduct = async (productId) => {
    const newProducts = (preferences.products || []).filter(p => p.id !== productId);
    await updatePreference('products', newProducts);
  };

  return (
    <PreferencesContext.Provider value={{
      preferences,
      isLoading,
      updatePreference,
      addProduct,
      removeProduct
    }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
