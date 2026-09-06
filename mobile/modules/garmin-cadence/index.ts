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
