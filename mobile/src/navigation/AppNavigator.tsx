import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import MainTabs from './MainTabs';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    primary: colors.secondary,
    border: colors.border,
  },
};

export default function AppNavigator() {
  const { accessToken, isLoading } = useAuth();

  // Restoring a stored session on launch — avoid flashing the Login screen
  // before we know whether a valid refresh token is already saved.
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  return <NavigationContainer theme={navTheme}>{accessToken ? <MainTabs /> : <LoginScreen />}</NavigationContainer>;
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
