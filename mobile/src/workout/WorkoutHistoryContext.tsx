import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import type { WorkoutSummaryParams } from '../navigation/WorkoutStack';

/** A finished workout as shown on the Home screen's Recent list. */
export type WorkoutRecord = WorkoutSummaryParams & {
  id: string;
  /** Unix ms when the workout was ended. */
  endedAt: number;
};

type WorkoutHistoryState = {
  /** Newest first. */
  workouts: WorkoutRecord[];
  isLoading: boolean;
  addWorkout: (summary: WorkoutSummaryParams) => Promise<WorkoutRecord>;
  removeWorkout: (id: string) => Promise<void>;
};

const WorkoutHistoryContext = createContext<WorkoutHistoryState | undefined>(undefined);

// A JSON file in the app's documents directory rather than SecureStore: a
// run's per-second cadence samples easily exceed SecureStore's ~2 KB value
// guidance, and none of this is secret.
const HISTORY_FILE = `${FileSystem.documentDirectory}workout-history.json`;
const MAX_RECORDS = 50;

async function readHistory(): Promise<WorkoutRecord[]> {
  try {
    const info = await FileSystem.getInfoAsync(HISTORY_FILE);
    if (!info.exists) return [];
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(HISTORY_FILE));
    return Array.isArray(parsed) ? (parsed as WorkoutRecord[]) : [];
  } catch (err) {
    console.error('[WorkoutHistory] failed to read history:', err);
    return [];
  }
}

async function writeHistory(records: WorkoutRecord[]): Promise<void> {
  await FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(records));
}

export function WorkoutHistoryProvider({ children }: { children: React.ReactNode }) {
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Mirror of `workouts` for the writers below, so back-to-back saves
  // build on the latest list without waiting for a re-render.
  const latest = useRef<WorkoutRecord[]>([]);
  latest.current = workouts;

  useEffect(() => {
    readHistory().then((records) => {
      latest.current = records;
      setWorkouts(records);
      setIsLoading(false);
    });
  }, []);

  const persist = useCallback(async (next: WorkoutRecord[]) => {
    latest.current = next;
    setWorkouts(next);
    await writeHistory(next).catch((err) => console.error('[WorkoutHistory] failed to write history:', err));
  }, []);

  const addWorkout = useCallback(
    async (summary: WorkoutSummaryParams) => {
      const record: WorkoutRecord = {
        ...summary,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        endedAt: Date.now(),
      };
      await persist([record, ...latest.current].slice(0, MAX_RECORDS));
      return record;
    },
    [persist],
  );

  const removeWorkout = useCallback(
    async (id: string) => {
      await persist(latest.current.filter((w) => w.id !== id));
    },
    [persist],
  );

  const value = useMemo(
    () => ({ workouts, isLoading, addWorkout, removeWorkout }),
    [workouts, isLoading, addWorkout, removeWorkout],
  );

  return <WorkoutHistoryContext.Provider value={value}>{children}</WorkoutHistoryContext.Provider>;
}

export function useWorkoutHistory(): WorkoutHistoryState {
  const ctx = useContext(WorkoutHistoryContext);
  if (!ctx) throw new Error('useWorkoutHistory must be used within WorkoutHistoryProvider');
  return ctx;
}
