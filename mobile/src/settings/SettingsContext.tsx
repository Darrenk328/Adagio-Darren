import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

// The only thing any live-cadence consumer (voice nudges now, potentially
// the matching engine later) should ever branch on. Adding a future
// source (e.g. phone-accelerometer-based) means adding a case here and to
// LiveCadenceContext's internals — no existing consumer changes.
export type CadenceSource = 'none' | 'garmin';

type SettingsState = {
  defaultTolerance: number;
  cadenceSource: CadenceSource;
  isLoading: boolean;
  setDefaultTolerance: (value: number) => Promise<void>;
  setCadenceSource: (value: CadenceSource) => Promise<void>;
};

const SettingsContext = createContext<SettingsState | undefined>(undefined);

const DEFAULT_TOLERANCE_KEY = 'adagio_default_tolerance';
const CADENCE_SOURCE_KEY = 'adagio_cadence_source';
const FALLBACK_TOLERANCE = 5;
const FALLBACK_CADENCE_SOURCE: CadenceSource = 'none';

function isCadenceSource(value: string): value is CadenceSource {
  return value === 'none' || value === 'garmin';
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [defaultTolerance, setDefaultToleranceState] = useState(FALLBACK_TOLERANCE);
  const [cadenceSource, setCadenceSourceState] = useState<CadenceSource>(FALLBACK_CADENCE_SOURCE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [storedTolerance, storedCadenceSource] = await Promise.all([
        SecureStore.getItemAsync(DEFAULT_TOLERANCE_KEY),
        SecureStore.getItemAsync(CADENCE_SOURCE_KEY),
      ]);
      if (storedTolerance) setDefaultToleranceState(Number(storedTolerance));
      if (storedCadenceSource && isCadenceSource(storedCadenceSource)) {
        setCadenceSourceState(storedCadenceSource);
      }
      setIsLoading(false);
    })();
  }, []);

  const setDefaultTolerance = useCallback(async (value: number) => {
    setDefaultToleranceState(value);
    await SecureStore.setItemAsync(DEFAULT_TOLERANCE_KEY, String(value));
  }, []);

  const setCadenceSource = useCallback(async (value: CadenceSource) => {
    setCadenceSourceState(value);
    await SecureStore.setItemAsync(CADENCE_SOURCE_KEY, value);
  }, []);

  return (
    <SettingsContext.Provider
      value={{ defaultTolerance, cadenceSource, isLoading, setDefaultTolerance, setCadenceSource }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
