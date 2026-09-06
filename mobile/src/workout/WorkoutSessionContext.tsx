import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

/**
 * Lightweight "is a workout currently playing" signal, published by
 * NowPlayingScreen and read by the persistent banner in MainTabs. This is
 * deliberately NOT the source of truth for playback (NowPlayingScreen owns
 * that, and keeps running in the background across tab switches courtesy of
 * React Navigation not unmounting inactive tabs) — it's just enough state
 * for the rest of the app to know a workout is in progress and let the user
 * tap back into it.
 */
export type WorkoutSession = {
  playlistName: string;
  isPlaying: boolean;
  elapsedSec: number;
};

type WorkoutSessionContextValue = {
  session: WorkoutSession | null;
  setSession: (session: WorkoutSession | null) => void;
};

const WorkoutSessionContext = createContext<WorkoutSessionContextValue | undefined>(undefined);

export function WorkoutSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<WorkoutSession | null>(null);

  // Stable identity so NowPlayingScreen's effects that call this don't need
  // it in their dependency arrays.
  const setSession = useCallback((next: WorkoutSession | null) => {
    setSessionState(next);
  }, []);

  const value = useMemo(() => ({ session, setSession }), [session, setSession]);

  return <WorkoutSessionContext.Provider value={value}>{children}</WorkoutSessionContext.Provider>;
}

export function useWorkoutSession() {
  const ctx = useContext(WorkoutSessionContext);
  if (!ctx) throw new Error('useWorkoutSession must be used within a WorkoutSessionProvider');
  return ctx;
}
