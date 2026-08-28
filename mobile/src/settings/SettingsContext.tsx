import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

type SettingsState = {
  defaultTolerance: number;
  isLoading: boolean;
  setDefaultTolerance: (value: number) => Promise<void>;
};

const SettingsContext = createContext<SettingsState | undefined>(undefined);

const DEFAULT_TOLERANCE_KEY = 'adagio_default_tolerance';
const FALLBACK_TOLERANCE = 5;

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [defaultTolerance, setDefaultToleranceState] = useState(FALLBACK_TOLERANCE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(DEFAULT_TOLERANCE_KEY);
      if (stored) setDefaultToleranceState(Number(stored));
      setIsLoading(false);
    })();
  }, []);

  const setDefaultTolerance = useCallback(async (value: number) => {
    setDefaultToleranceState(value);
    await SecureStore.setItemAsync(DEFAULT_TOLERANCE_KEY, String(value));
  }, []);

  return (
    <SettingsContext.Provider value={{ defaultTolerance, isLoading, setDefaultTolerance }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
