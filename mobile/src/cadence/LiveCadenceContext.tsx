import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSettings } from '../settings/SettingsContext';
import * as GarminCadence from '../../modules/garmin-cadence';
import type { ConnectionStatus, ConnectionStatusEvent, CadenceEvent } from '../../modules/garmin-cadence';
import * as HealthKitCadence from '../../modules/healthkit-cadence';
import type { StatusEvent as HealthKitStatusEvent, TargetPaceOptions } from '../../modules/healthkit-cadence';

// The one thing any live-cadence consumer (voice nudges today,
// potentially the matching engine later) should ever read from — see
// SettingsContext's cadenceSource. Adding a future source means changing
// this file's internals only; no existing consumer needs to change.
//
// HealthKit's own 'tracking' status is normalized to 'ready' here so
// useCadenceNudges's `connectionStatus === 'ready'` gate (written for
// Garmin) keeps working unchanged for either source — see below.

type LiveCadenceStatus = ConnectionStatus | 'idle' | 'stopped' | 'error' | 'unavailable';

type LiveCadenceState = {
  /** 'idle' until a source is selected and connected/tracking. */
  connectionStatus: LiveCadenceStatus;
  /** Garmin-only — always null for 'healthkit'/'appleWatch' (no paired device to name). */
  deviceName: string | null;
  /** Only ever non-null once connectionStatus is 'ready'. */
  currentCadence: number | null;
  /** Apple Watch only — cumulative steps this workout; null for other sources. */
  currentSteps: number | null;
  /** Apple Watch only — most recent running speed in m/s; null when not
   * moving or for other sources. Consumers convert to pace in the unit
   * the runner chose. */
  currentSpeedMps: number | null;
  /** No-op when cadenceSource isn't 'garmin'. */
  findDevice: () => void;
  /** No-op unless cadenceSource is 'healthkit' or 'appleWatch'. Shows
   * HealthKit's system permission prompt — call once, e.g. from Settings. */
  requestHealthAccess: () => Promise<void>;
  /** No-op when cadenceSource isn't 'healthkit'. Call when a workout
   * begins — HealthKit's session is workout-scoped, unlike Garmin's
   * ambient BLE connection, so there's no equivalent of findDevice()
   * that makes sense to trigger from the Settings screen alone.
   * 'appleWatch' never needs this: a real Watch controls when its own
   * mirrored session starts and stops, not the phone. */
  startTracking: () => Promise<void>;
  /** No-op when cadenceSource isn't 'healthkit' — see startTracking. */
  stopTracking: () => Promise<void>;
  /** 'appleWatch' only: pushes the current target to the Watch so it can
   * show live-vs-target on its own screen. Call with null when the
   * workout ends. No-op for other sources. */
  setTargetCadence: (target: number | null, tolerance: number, options?: TargetPaceOptions) => Promise<void>;
  /** Ends the workout on whichever source owns one: stops the iPhone-owned
   * HealthKit session, or asks a mirrored Apple Watch session to end.
   * No-op for Garmin/none (Garmin's connection is ambient, not per-workout). */
  endWorkout: () => Promise<void>;
};

const LiveCadenceContext = createContext<LiveCadenceState | undefined>(undefined);

export function LiveCadenceProvider({ children }: { children: React.ReactNode }) {
  const { cadenceSource } = useSettings();
  const [connectionStatus, setConnectionStatus] = useState<LiveCadenceStatus>('idle');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [currentCadence, setCurrentCadence] = useState<number | null>(null);
  const [currentSteps, setCurrentSteps] = useState<number | null>(null);
  const [currentSpeedMps, setCurrentSpeedMps] = useState<number | null>(null);

  useEffect(() => {
    if (cadenceSource === 'garmin') {
      const statusSub = GarminCadence.addConnectionStatusListener((event: ConnectionStatusEvent) => {
        setConnectionStatus(event.status);
        if (event.deviceName) setDeviceName(event.deviceName);
        // Only "ready" means messages are actually being listened for —
        // clear any stale cadence number for every other status so the UI
        // never shows a number that's no longer being updated.
        if (event.status !== 'ready') setCurrentCadence(null);
      });

      const cadenceSub = GarminCadence.addCadenceListener((event: CadenceEvent) => {
        setCurrentCadence(event.cadence);
      });

      return () => {
        statusSub.remove();
        cadenceSub.remove();
      };
    }

    if (cadenceSource === 'healthkit' || cadenceSource === 'appleWatch') {
      // Same native module, same events, for both — 'appleWatch' just
      // never calls start()/stop() on it (see below): the Watch app
      // controls when a mirrored session begins and ends, not the phone.
      const statusSub = HealthKitCadence.addStatusListener((event: HealthKitStatusEvent) => {
        // 'tracking' -> 'ready': see the module-level note on why.
        const normalized = event.status === 'tracking' ? 'ready' : event.status;
        setConnectionStatus(normalized);
        if (normalized !== 'ready') {
          setCurrentCadence(null);
          setCurrentSteps(null);
          setCurrentSpeedMps(null);
        }
      });

      const cadenceSub = HealthKitCadence.addCadenceListener((event) => {
        setCurrentCadence(event.cadence);
        if (event.steps != null) setCurrentSteps(event.steps);
        // Speed is omitted from the payload when the Watch has none yet
        // (no GPS fix) — keep the last known value rather than flickering.
        if (event.speedMps != null) setCurrentSpeedMps(event.speedMps);
      });

      return () => {
        statusSub.remove();
        cadenceSub.remove();
      };
    }

    setConnectionStatus('idle');
    setDeviceName(null);
    setCurrentCadence(null);
    setCurrentSteps(null);
    setCurrentSpeedMps(null);
  }, [cadenceSource]);

  const findDevice = () => {
    if (cadenceSource === 'garmin') {
      GarminCadence.findDevice();
    }
  };

  const requestHealthAccess = async () => {
    // Both sources need this — the phone reads step statistics off a
    // mirrored (appleWatch) session too, same authorization as its own.
    if (cadenceSource === 'healthkit' || cadenceSource === 'appleWatch') {
      await HealthKitCadence.requestAuthorization();
    }
  };

  const startTracking = async () => {
    if (cadenceSource === 'healthkit') {
      await HealthKitCadence.start();
    }
  };

  const stopTracking = async () => {
    if (cadenceSource === 'healthkit') {
      await HealthKitCadence.stop();
    }
  };

  const setTargetCadence = async (target: number | null, tolerance: number, options?: TargetPaceOptions) => {
    if (cadenceSource === 'appleWatch') {
      await HealthKitCadence.setTargetCadence(target, tolerance, options);
    }
  };

  const endWorkout = async () => {
    if (cadenceSource === 'healthkit') await HealthKitCadence.stop();
    if (cadenceSource === 'appleWatch') await HealthKitCadence.endWatchWorkout();
  };

  return (
    <LiveCadenceContext.Provider
      value={{
        connectionStatus,
        deviceName,
        currentCadence,
        currentSteps,
        currentSpeedMps,
        findDevice,
        requestHealthAccess,
        startTracking,
        stopTracking,
        setTargetCadence,
        endWorkout,
      }}
    >
      {children}
    </LiveCadenceContext.Provider>
  );
}

export function useLiveCadence() {
  const ctx = useContext(LiveCadenceContext);
  if (!ctx) throw new Error('useLiveCadence must be used within LiveCadenceProvider');
  return ctx;
}
