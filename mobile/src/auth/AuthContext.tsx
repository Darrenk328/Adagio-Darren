import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken, setAuthHandlers } from '../api/client';
import * as AppleMusic from '../../modules/apple-music';

// Apple Music has no equivalent of Spotify's accessToken: MusicKit holds
// authorization on-device (see modules/apple-music), there's nothing to
// exchange or refresh. So "logged in" here means EITHER a Spotify token
// OR an authorized MusicKit status — musicSource tells the rest of the
// app (playlist/track fetching, playback controls) which one is active,
// since those still need very different code paths per service.
export type MusicSource = 'spotify' | 'appleMusic' | null;

type AuthState = {
  accessToken: string | null;
  musicSource: MusicSource;
  isLoading: boolean;
  sessionExpiredMessage: string | null;
  login: (accessToken: string, refreshToken?: string) => Promise<void>;
  loginWithAppleMusic: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'adagio_access_token';
const REFRESH_TOKEN_KEY = 'adagio_refresh_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [musicSource, setMusicSource] = useState<MusicSource>(null);
  // Starts true: on launch we don't know yet whether a stored session exists.
  const [isLoading, setIsLoading] = useState(true);
  // Set when a mid-session token refresh fails (refresh token itself is
  // dead) — shown as a banner on LoginScreen so it's clear why the user
  // landed back there instead of it looking like a silent, unexplained logout.
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  const login = useCallback(async (token: string, refreshToken?: string) => {
    setSessionExpiredMessage(null);
    setIsLoading(true);
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
      if (refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
      setAccessToken(token);
      setMusicSource('spotify');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Shows MusicKit's system prompt. A prior denial will NOT re-prompt —
  // iOS only asks once — so a repeat call here just returns that same
  // 'denied' status again; the caller has to send the user to Settings.
  const loginWithAppleMusic = useCallback(async () => {
    const status = await AppleMusic.authorize();
    if (status === 'authorized') {
      setMusicSource('appleMusic');
      return { success: true };
    }
    const errors: Record<string, string> = {
      denied: 'Apple Music access denied. Enable it in Settings › Privacy › Media & Apple Music.',
      restricted: 'Apple Music access is restricted on this device.',
      notDetermined: 'Apple Music authorization was dismissed.',
      unavailable: 'Apple Music requires iOS 16 or later.',
    };
    return { success: false, error: errors[status] ?? `Unknown Apple Music authorization status: ${status}.` };
  }, []);

  const logout = useCallback(async () => {
    setSessionExpiredMessage(null);
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    // Not clearing MusicKit's own authorization (there's no API to do
    // that — it's an OS-level grant, revoked only from iOS Settings) —
    // just stop treating this session as logged in via it.
    setMusicSource(null);
  }, []);

  // Registers this context as api/client.ts's bridge back into React state
  // for its central 401-handling interceptor — lets that module trigger a
  // refresh (and persist/apply the result, or fall back to a clear
  // "session expired" state) without importing this context directly.
  useEffect(() => {
    setAuthHandlers({
      getRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      onTokenRefreshed: async (newAccessToken, newRefreshToken) => {
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken);
        if (newRefreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken);
        setAccessToken(newAccessToken);
        setMusicSource('spotify');
      },
      onSessionExpired: async () => {
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        setAccessToken(null);
        setMusicSource(null);
        setSessionExpiredMessage('Your session expired — please log in again.');
      },
    });
  }, []);

  // On launch, restore a previous session. Access tokens expire (~1hr for
  // Spotify), so rather than trust a possibly-stale stored access token, use
  // the stored refresh token to get a guaranteed-fresh one.
  //
  // Apple Music needs no restore step to speak of: MusicKit's grant is an
  // OS-level permission, not something this app stores or can expire on
  // its own — currentAuthorizationStatus() just reads back whatever the
  // user already decided, possibly in a previous session entirely.
  useEffect(() => {
    (async () => {
      if (AppleMusic.currentAuthorizationStatus() === 'authorized') {
        setMusicSource('appleMusic');
      }

      try {
        const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!storedRefreshToken) return;

        const tokens = await refreshAccessToken(storedRefreshToken);
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.access_token);
        if (tokens.refresh_token) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh_token);
        setAccessToken(tokens.access_token);
        setMusicSource('spotify');
      } catch {
        // Refresh token expired/revoked — fall back to requiring a fresh
        // login, unless Apple Music is already covering us (set above).
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <AuthContext.Provider value={{ accessToken, musicSource, isLoading, sessionExpiredMessage, login, loginWithAppleMusic, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
