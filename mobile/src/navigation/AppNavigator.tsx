import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import PlaylistPickerScreen from '../screens/PlaylistPickerScreen';
import CadenceInputScreen from '../screens/CadenceInputScreen';
import ResultsScreen from '../screens/ResultsScreen';

export type RootStackParamList = {
  Login: undefined;
  PlaylistPicker: undefined;
  CadenceInput: { playlistId: string; playlistName: string };
  Results: { playlistId: string; playlistName: string; cadence: number; tolerance: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerTitleStyle: { color: colors.text } }}>
        {!accessToken ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="PlaylistPicker" component={PlaylistPickerScreen} options={{ title: 'Playlists' }} />
            <Stack.Screen name="CadenceInput" component={CadenceInputScreen} options={{ title: 'Set cadence' }} />
            <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'Matches' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
