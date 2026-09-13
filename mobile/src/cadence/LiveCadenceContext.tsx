import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSettings } from '../settings/SettingsContext';
import * as GarminCadence from '../../modules/garmin-cadence';
import type { ConnectionStatus, ConnectionStatusEvent, CadenceEvent } from '../../modules/garmin-cadence';
import * as HealthKitCadence from '../../modules/healthkit-cadence';
import type { StatusEvent as HealthKitStatusEvent } from '../../modules/healthkit-cadence';

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
  /** Garmin-only — always null for 'healthkit' (no paired device to name). */
  deviceName: string | null;
  /** Only ever non-null once connectionStatus is 'ready'. */
  currentCadence: number | null;
  /** No-op when cadenceSource isn't 'garmin'. */
  findDevice: () => void;
  /** No-op when cadenceSource isn't 'healthkit'. Shows HealthKit's system
   * permission prompt — call once, e.g. from Settings, before startTracking. */
  requestHealthAccess: () => Promise<void>;
  /** No-op when cadenceSource isn't 'healthkit'. Call when a workout
   * begins — HealthKit's session is workout-scoped, unlike Garmin's
   * ambient BLE connection, so there's no equivalent of findDevice()
   * that makes sense to trigger from the Settings screen alone. */
  startTracking: () => Promise<void>;
  /** No-op when cadenceSource isn't 'healthkit'. Call when the workout ends. */
  stopTracking: () => Promise<void>;
};

const LiveCadenceContext = createContext<LiveCadenceState | undefined>(undefined);

export function LiveCadenceProvider({ children }: { children: React.ReactNode }) {
  const { cadenceSource } = useSettings();
  const [connectionStatus, setConnectionStatus] = useState<LiveCadenceStatus>('idle');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [currentCadence, setCurrentCadence] = useState<number | null>(null);

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

    if (cadenceSource === 'healthkit') {
      const statusSub = HealthKitCadence.addStatusListener((event: HealthKitStatusEvent) => {
        // 'tracking' -> 'ready': see the module-level note on why.
        const normalized = event.status === 'tracking' ? 'ready' : event.status;
        setConnectionStatus(normalized);
        if (normalized !== 'ready') setCurrentCadence(null);
      });

      const cadenceSub = HealthKitCadence.addCadenceListener((event) => {
        setCurrentCadence(event.cadence);
      });

      return () => {
        statusSub.remove();
        cadenceSub.remove();
      };
    }

    setConnectionStatus('idle');
    setDeviceName(null);
    setCurrentCadence(null);
  }, [cadenceSource]);

  const findDevice = () => {
    if (cadenceSource === 'garmin') {
      GarminCadence.findDevice();
    }
  };

  const requestHealthAccess = async () => {
    if (cadenceSource === 'healthkit') {
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

  return (
    <LiveCadenceContext.Provider
      value={{
        connectionStatus,
        deviceName,
        currentCadence,
        findDevice,
        requestHealthAccess,
        startTracking,
        stopTracking,
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
