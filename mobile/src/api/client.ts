import axios from 'axios';
import { BACKEND_URL } from '../config';

export const backend = axios.create({ baseURL: BACKEND_URL });

export type Playlist = {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  artistId: string | null;
  albumArtUrl: string | null;
  bpm: number | null;
};

export type MatchedTrack = Track & {
  effectiveBpm: number;
  distance: number;
  // 'exact' = within the originally requested tolerance; 'widened' = only
  // matched because the backend cascaded to a wider tolerance.
  matchTier: 'exact' | 'widened';
};

export type MatchResult = { matches: MatchedTrack[]; tolerance: number };

export type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeCodeForToken(code: string) {
  const { data } = await backend.post<TokenResponse>('/auth/token', { code });
  return data;
}

export async function refreshAccessToken(refreshToken: string) {
  const { data } = await backend.post<TokenResponse>('/auth/refresh', { refreshToken });
  return data;
}

export async function fetchPlaylists(accessToken: string) {
  const { data } = await backend.get<Playlist[]>('/playlists', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export async function fetchPlaylistTracks(accessToken: string, playlistId: string) {
  const { data } = await backend.get<Track[]>(`/playlists/${playlistId}/tracks`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export async function matchTracks(tracks: Track[], cadence: number, tolerance: number) {
  const { data } = await backend.post<MatchResult>('/match', { tracks, cadence, tolerance });
  return data;
}

export type PlaybackState = {
  isPlaying: boolean;
  device: { id: string; name: string } | null;
  progressMs: number | null;
  item: { id: string; name: string } | null;
} | null;

// Thrown by the playback functions below when Spotify has no active
// device — i.e. the user doesn't have Spotify open anywhere right now.
export class NoActiveDeviceError extends Error {
  constructor() {
    super('No active Spotify device found');
    this.name = 'NoActiveDeviceError';
  }
}

function authHeader(accessToken: string) {
  return { headers: { Authorization: `Bearer ${accessToken}` } };
}

async function callPlaybackEndpoint<T>(request: () => Promise<{ data: T }>): Promise<T> {
  try {
    const { data } = await request();
    return data;
  } catch (err: any) {
    if (err?.response?.status === 409 && err.response.data?.error === 'NO_ACTIVE_DEVICE') {
      throw new NoActiveDeviceError();
    }
    throw err;
  }
}

export function getPlaybackState(accessToken: string) {
  return callPlaybackEndpoint<PlaybackState>(() => backend.get('/playback/state', authHeader(accessToken)));
}

export function startPlayback(accessToken: string, trackIds: string[]) {
  return callPlaybackEndpoint(() => backend.post('/playback/play', { trackIds }, authHeader(accessToken)));
}

export function pausePlayback(accessToken: string) {
  return callPlaybackEndpoint(() => backend.post('/playback/pause', {}, authHeader(accessToken)));
}

export function resumePlayback(accessToken: string) {
  return callPlaybackEndpoint(() => backend.post('/playback/resume', {}, authHeader(accessToken)));
}

export function skipToNextTrack(accessToken: string) {
  return callPlaybackEndpoint(() => backend.post('/playback/next', {}, authHeader(accessToken)));
}
