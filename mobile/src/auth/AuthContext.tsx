import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken } from '../api/client';

type AuthState = {
  accessToken: string | null;
  isLoading: boolean;
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

  const login = useCallback(async (token: string, refreshToken?: string) => {
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
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setAccessToken(null);
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
    <AuthContext.Provider value={{ accessToken, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
