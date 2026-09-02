import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken, setAuthHandlers } from '../api/client';

type AuthState = {
  accessToken: string | null;
  isLoading: boolean;
  sessionExpiredMessage: string | null;
  login: (accessToken: string, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'adagio_access_token';
const REFRESH_TOKEN_KEY = 'adagio_refresh_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
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
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setSessionExpiredMessage(null);
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setAccessToken(null);
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
      },
      onSessionExpired: async () => {
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        setAccessToken(null);
        setSessionExpiredMessage('Your session expired — please log in again.');
      },
    });
  }, []);

  // On launch, restore a previous session. Access tokens expire (~1hr for
  // Spotify), so rather than trust a possibly-stale stored access token, use
  // the stored refresh token to get a guaranteed-fresh one.
  useEffect(() => {
    (async () => {
      try {
        const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!storedRefreshToken) return;

        const tokens = await refreshAccessToken(storedRefreshToken);
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.access_token);
        if (tokens.refresh_token) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh_token);
        setAccessToken(tokens.access_token);
      } catch {
        // Refresh token expired/revoked — fall back to requiring a fresh login.
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <AuthContext.Provider value={{ accessToken, isLoading, sessionExpiredMessage, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
