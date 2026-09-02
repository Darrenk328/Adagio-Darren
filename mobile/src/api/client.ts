import axios, { AxiosRequestConfig } from 'axios';
import { BACKEND_URL } from '../config';

export const backend = axios.create({ baseURL: BACKEND_URL });

// --- Central 401 handling ---------------------------------------------
//
// Every function below takes `accessToken` as an explicit argument and
// builds its own Authorization header — there's no single place that
// "owns" the current token for requests. AuthContext is that owner (it
// holds the token in React state + SecureStore), so this module exposes a
// small bridge it registers into once on mount, letting this file trigger
// a refresh and update AuthContext's state without importing React/context
// here directly.
type AuthHandlers = {
  getRefreshToken: () => Promise<string | null>;
  onTokenRefreshed: (accessToken: string, refreshToken?: string) => Promise<void>;
  onSessionExpired: () => Promise<void>;
};

let authHandlers: AuthHandlers | null = null;

export function setAuthHandlers(handlers: AuthHandlers) {
  authHandlers = handlers;
}

interface RetryableRequestConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

// Concurrent 401s (e.g. NowPlaying firing several playback calls near-
// simultaneously) share this single in-flight refresh rather than each
// firing their own — important since Spotify rotates the refresh token,
// so two parallel refresh calls could race and invalidate each other.
// Cleared via .finally() once settled (success or failure) so a *later*
// expiry later in the session gets a fresh attempt, not a stale promise.
let refreshPromise: Promise<string> | null = null;

function getRefreshedAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const attempt = (async () => {
      if (!authHandlers) throw new Error('Auth handlers not configured');
      const storedRefreshToken = await authHandlers.getRefreshToken();
      if (!storedRefreshToken) throw new Error('No refresh token available');

      const tokens = await refreshAccessToken(storedRefreshToken);
      await authHandlers.onTokenRefreshed(tokens.access_token, tokens.refresh_token);
      return tokens.access_token;
    })();

    refreshPromise = attempt.finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

backend.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest: RetryableRequestConfig | undefined = error.config;

    // Don't try to "refresh and retry" a failing /auth/refresh or
    // /auth/token call itself — a 401 from /auth/refresh IS the refresh
    // failing (dead refresh token), and retrying it would loop forever.
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/refresh') || originalRequest?.url?.includes('/auth/token');

    if (error.response?.status === 401 && originalRequest && !isAuthEndpoint && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newAccessToken = await getRefreshedAccessToken();
        originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${newAccessToken}` };
        return backend(originalRequest); // transparent retry — caller never sees the 401
      } catch {
        // Refresh itself failed — the session is genuinely over.
        if (authHandlers) await authHandlers.onSessionExpired();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

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
