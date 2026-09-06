import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSettings } from '../settings/SettingsContext';
import * as GarminCadence from '../../modules/garmin-cadence';
import type { ConnectionStatus, ConnectionStatusEvent, CadenceEvent } from '../../modules/garmin-cadence';

// The one thing any live-cadence consumer (voice nudges today,
// potentially the matching engine later) should ever read from — see
// SettingsContext's cadenceSource. Adding a future second source (e.g.
// phone-accelerometer-based) means changing this file's internals only;
// no existing consumer needs to change.

type LiveCadenceStatus = ConnectionStatus | 'idle';

type LiveCadenceState = {
  /** 'idle' until cadenceSource is 'garmin' and findDevice() has been called at least once. */
  connectionStatus: LiveCadenceStatus;
  deviceName: string | null;
  /** Only ever non-null once connectionStatus is 'ready' — see GarminCadenceModule's
   * deviceCharacteristicsDiscovered handling for why "connected" alone isn't enough. */
  currentCadence: number | null;
  /** No-op when cadenceSource isn't 'garmin'. */
  findDevice: () => void;
};

const LiveCadenceContext = createContext<LiveCadenceState | undefined>(undefined);

export function LiveCadenceProvider({ children }: { children: React.ReactNode }) {
  const { cadenceSource } = useSettings();
  const [connectionStatus, setConnectionStatus] = useState<LiveCadenceStatus>('idle');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [currentCadence, setCurrentCadence] = useState<number | null>(null);

  useEffect(() => {
    if (cadenceSource !== 'garmin') {
      setConnectionStatus('idle');
      setDeviceName(null);
      setCurrentCadence(null);
      return;
    }

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
  }, [cadenceSource]);

  const findDevice = () => {
    if (cadenceSource === 'garmin') {
      GarminCadence.findDevice();
    }
  };

  return (
    <LiveCadenceContext.Provider value={{ connectionStatus, deviceName, currentCadence, findDevice }}>
      {children}
    </LiveCadenceContext.Provider>
  );
}

export function useLiveCadence() {
  const ctx = useContext(LiveCadenceContext);
  if (!ctx) throw new Error('useLiveCadence must be used within LiveCadenceProvider');
  return ctx;
}
