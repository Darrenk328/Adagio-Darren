import { requireNativeModule, EventEmitter, type Subscription } from 'expo-modules-core';

// Kept as a thin wrapper over the native module — no React here on
// purpose. See src/cadence/LiveCadenceContext.tsx for the
// React-facing hook that actually consumes this, matching where the
// rest of this app's contexts (auth/, settings/, workout/) live.

export type ConnectionStatus =
  | 'needsGCM'
  | 'opening'
  | 'found'
  | 'connected'
  | 'ready'
  | 'notConnected'
  | 'bluetoothNotReady'
  | 'notFound'
  | 'invalidDevice'
  | 'noDeviceReturned'
  | 'unknown';

export type ConnectionStatusEvent = { status: ConnectionStatus; deviceName?: string };
export type CadenceEvent = { cadence: number };

const nativeModule = requireNativeModule('GarminCadenceModule');
const emitter = new EventEmitter(nativeModule);

export type GarminWatchAppStatus = {
  /** Whether a watch has been picked (this launch or a previous one). */
  hasDevice: boolean;
  deviceName?: string;
  connected?: boolean;
  /** Whether the Adagio Connect IQ app is on the watch; null when it can't be checked (watch not connected). */
  installed?: boolean | null;
};

/**
 * Result of asking the watch to open the Adagio app:
 * - promptShown: the watch is showing "open Adagio?" — the runner taps once
 * - alreadyRunning: nothing to do, it's already open
 * - notInstalled / noDevice / notConnected / promptNotShown / failed: see LiveCadenceContext for the copy
 */
export type OpenWatchAppResult =
  | 'promptShown'
  | 'alreadyRunning'
  | 'notInstalled'
  | 'noDevice'
  | 'notConnected'
  | 'promptNotShown'
  | 'failed';

/** Whether a watch is remembered and whether Adagio is installed on it. Never rejects. */
export async function getWatchAppStatus(): Promise<GarminWatchAppStatus> {
  return nativeModule.getWatchAppStatus();
}

/**
 * Asks the watch to open the Adagio app, which starts its recording
 * session immediately. Garmin never launches an app silently — the watch
 * shows a one-tap confirmation prompt.
 */
export async function openWatchApp(): Promise<OpenWatchAppResult> {
  return nativeModule.openWatchApp();
}

/** Launches Garmin Connect Mobile's device picker. */
export function findDevice(): void {
  nativeModule.findDevice();
}

export function addConnectionStatusListener(
  listener: (event: ConnectionStatusEvent) => void,
): Subscription {
  return emitter.addListener('onConnectionStatusChanged', listener);
}

export function addCadenceListener(listener: (event: CadenceEvent) => void): Subscription {
  return emitter.addListener('onCadenceReceived', listener);
}
