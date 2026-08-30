import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import type { MatchedTrack } from '../api/client';
import type { Segment } from '../types/workout';

import PlaylistPickerScreen from '../screens/PlaylistPickerScreen';
import WorkoutSetupScreen from '../screens/WorkoutSetupScreen';
import ResultsScreen from '../screens/ResultsScreen';
import NowPlayingScreen from '../screens/NowPlayingScreen';

export type WorkoutStackParamList = {
  PlaylistPicker: undefined;
  WorkoutSetup: { playlistId: string; playlistName: string };
  Results: { playlistId: string; playlistName: string; cadence: number; tolerance: number; unit: string };
  NowPlaying: {
    playlistId: string;
    playlistName: string;
    queue: MatchedTrack[];
    segments?: Segment[];
    unit?: string;
  };
};

const Stack = createNativeStackNavigator<WorkoutStackParamList>();

export default function WorkoutStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTitleStyle: { color: colors.text } }}>
      <Stack.Screen name="PlaylistPicker" component={PlaylistPickerScreen} options={{ title: 'Playlists' }} />
      <Stack.Screen name="WorkoutSetup" component={WorkoutSetupScreen} options={{ title: 'Set up workout' }} />
      <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'Matches' }} />
      <Stack.Screen name="NowPlaying" component={NowPlayingScreen} options={{ title: 'Now Playing' }} />
    </Stack.Navigator>
  );
}
