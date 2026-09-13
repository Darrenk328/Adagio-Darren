import { requireNativeModule } from 'expo-modules-core';
import type { Playlist, Track } from '../../src/api/client';

// Thin wrapper over the native module, matching the style of
// modules/garmin-cadence/index.ts. No React here — a context/hook that
// wants this belongs in src/, alongside AuthContext.tsx and
// LiveCadenceContext.tsx.

export type AuthorizationStatus = 'authorized' | 'denied' | 'restricted' | 'notDetermined' | 'unknown';

const nativeModule = requireNativeModule('AppleMusicModule');

export function currentAuthorizationStatus(): AuthorizationStatus {
  return nativeModule.currentAuthorizationStatus();
}

/** Shows the system prompt. A prior denial will NOT re-prompt — iOS only asks once. */
export async function authorize(): Promise<AuthorizationStatus> {
  return nativeModule.authorize();
}

/**
 * Library playlists, shaped like src/api/client.ts's Playlist type so
 * they can flow through the same UI as Spotify playlists. `trackCount`
 * is 0 until fetchPlaylistTracks has been called for that playlist.
 */
export async function fetchPlaylists(limit?: number): Promise<Playlist[]> {
  return nativeModule.fetchPlaylists(limit ?? null);
}

/**
 * A playlist's tracks, shaped like src/api/client.ts's Track type.
 * `bpm` and `artistId` are always null — MusicKit's public API doesn't
 * expose tempo or a track-level artist id. Apple Music tracks still
 * need the same BPM lookup Spotify tracks get before they can be
 * matched against a target cadence.
 */
export async function fetchPlaylistTracks(playlistId: string): Promise<Track[]> {
  return nativeModule.fetchPlaylistTracks(playlistId);
}

// Playback happens natively on this device via MusicKit's
// ApplicationMusicPlayer — unlike Spotify Connect (src/api/client.ts's
// startPlayback/pausePlayback), there's no remote device to find or lose,
// so there's no NoActiveDeviceError equivalent here.

/** Starts playback of these track ids, in order. */
export async function play(trackIds: string[]): Promise<void> {
  return nativeModule.play(trackIds);
}

export function pause(): void {
  nativeModule.pause();
}

export async function resume(): Promise<void> {
  return nativeModule.resume();
}

export async function skipToNext(): Promise<void> {
  return nativeModule.skipToNext();
}
