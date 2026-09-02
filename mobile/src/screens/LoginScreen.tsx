import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { colors } from '../theme/colors';
import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from '../config';
import { exchangeCodeForToken } from '../api/client';
import { useAuth } from '../auth/AuthContext';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export default function LoginScreen() {
  const { login, sessionExpiredMessage } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SPOTIFY_SCOPES,
      redirectUri: SPOTIFY_REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: false, // code exchange happens on our backend, which holds the client secret
    },
    discovery,
  );

  const handleLogin = async () => {
    setIsConnecting(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success' || !result.params.code) {
        if (result.type !== 'cancel') Alert.alert('Login failed', 'Could not get an authorization code from Spotify.');
        return;
      }

      const tokens = await exchangeCodeForToken(result.params.code);
      await login(tokens.access_token, tokens.refresh_token);
    } catch (err) {
      console.error(err);
      Alert.alert('Login failed', 'Something went wrong connecting to Spotify.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Adagio</Text>
      <Text style={styles.subtitle}>Match your playlist to your running (or cycling) cadence</Text>

      {sessionExpiredMessage && (
        <View style={styles.sessionExpiredBanner}>
          <Text style={styles.sessionExpiredText}>{sessionExpiredMessage}</Text>
        </View>
      )}

      <Pressable
        style={[styles.button, !request && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={!request || isConnecting}
      >
        {isConnecting ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.buttonText}>Connect with Spotify</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 40, fontWeight: '700', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 16, color: colors.textMuted, marginBottom: 48, textAlign: 'center' },
  sessionExpiredBanner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    width: '100%',
  },
  sessionExpiredText: { color: colors.text, fontSize: 14, textAlign: 'center' },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
});
