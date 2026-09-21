import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { SettingsProvider } from './src/settings/SettingsContext';
import { LiveCadenceProvider } from './src/cadence/LiveCadenceContext';
import { WorkoutHistoryProvider } from './src/workout/WorkoutHistoryContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SettingsProvider>
            <LiveCadenceProvider>
              <WorkoutHistoryProvider>
                <StatusBar style="dark" />
                <AppNavigator />
              </WorkoutHistoryProvider>
            </LiveCadenceProvider>
          </SettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
