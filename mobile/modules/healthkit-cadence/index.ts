import { requireNativeModule, EventEmitter, type Subscription } from 'expo-modules-core';

// Thin wrapper, matching modules/garmin-cadence/index.ts's style. See
// HealthKitCadenceModule.swift's doc comment for the important caveat:
// this is cadence ESTIMATED from the iPhone's own sensors via an
// HKWorkoutSession, not genuine Apple Watch telemetry.

export type TrackingStatus = 'idle' | 'tracking' | 'stopped' | 'error' | 'unavailable';

export type StatusEvent = { status: TrackingStatus; error?: string };
export type CadenceEvent = {
  cadence: number;
  /** Apple Watch only: cumulative steps this workout. */
  steps?: number;
  /** Apple Watch only: most recent running speed, m/s (convert to pace in the runner's unit). */
  speedMps?: number;
};

const nativeModule = requireNativeModule('HealthKitCadenceModule');
const emitter = new EventEmitter(nativeModule);

export function isHealthDataAvailable(): boolean {
  return nativeModule.isHealthDataAvailable();
}

/** Shows the system HealthKit permission prompt. Read-grant status is never revealed by the OS. */
export async function requestAuthorization(): Promise<void> {
  return nativeModule.requestAuthorization();
}

/** Starts an iPhone-owned running workout session and begins estimating cadence from it. */
export async function start(): Promise<void> {
  return nativeModule.start();
}

/** Ends the workout session. Safe to call when not tracking. */
export async function stop(): Promise<void> {
  return nativeModule.stop();
}

/**
 * Tells a mirrored Apple Watch session the current target (so the Watch can
 * show live-vs-target itself). Cheap; no-op when no Watch session is active.
 * Pass `null` when the workout ends.
 */
export type PaceUnit = 'mi' | 'km';

export type TargetPaceOptions = {
  /** Distance unit the runner chose for pace display. Defaults to miles on the Watch. */
  paceUnit?: PaceUnit;
  /** Their typed target pace, in seconds per paceUnit — only for "By pace" setups. */
  targetPaceSeconds?: number;
};

export async function setTargetCadence(
  target: number | null,
  tolerance: number,
  options: TargetPaceOptions = {},
): Promise<void> {
  return nativeModule.setTargetCadence(target, tolerance, options.paceUnit ?? null, options.targetPaceSeconds ?? null);
}

export type WatchStatus = {
  /** false on iPads etc. where WatchConnectivity doesn't exist. */
  supported: boolean;
  paired: boolean;
  /** Whether the Adagio Watch app is installed on the paired Watch. */
  appInstalled: boolean;
};

/** Whether an Apple Watch is paired and has the Adagio Watch app. Never rejects. */
export async function getWatchStatus(): Promise<WatchStatus> {
  return nativeModule.getWatchStatus();
}

/**
 * Launches the Adagio Watch app with a running-workout configuration so it
 * starts (and mirrors) a session without the runner touching the Watch.
 * Resolves once the launch is accepted; the session itself arrives via
 * onStatusChanged 'tracking' shortly after. Rejects if the Watch can't be
 * reached or doesn't have the app.
 */
export async function startWatchWorkout(): Promise<void> {
  return nativeModule.startWatchWorkout();
}

/** Re-arms mirrored-session observation and re-reports status; returns the Watch status. */
export async function reconnectWatch(): Promise<WatchStatus> {
  return nativeModule.reconnectWatch();
}

/** Asks a mirrored Apple Watch session to end. No-op when none is active. */
export async function endWatchWorkout(): Promise<void> {
  return nativeModule.endWatchWorkout();
}

export function addStatusListener(listener: (event: StatusEvent) => void): Subscription {
  return emitter.addListener('onStatusChanged', listener);
}

export function addCadenceListener(listener: (event: CadenceEvent) => void): Subscription {
  return emitter.addListener('onCadenceReceived', listener);
}
