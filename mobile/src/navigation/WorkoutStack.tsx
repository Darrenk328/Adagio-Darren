import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';

import PlaylistPickerScreen from '../screens/PlaylistPickerScreen';
import CadenceInputScreen from '../screens/CadenceInputScreen';
import ResultsScreen from '../screens/ResultsScreen';

export type WorkoutStackParamList = {
  PlaylistPicker: undefined;
  CadenceInput: { playlistId: string; playlistName: string };
  Results: { playlistId: string; playlistName: string; cadence: number; tolerance: number; unit: string };
};

const Stack = createNativeStackNavigator<WorkoutStackParamList>();

export default function WorkoutStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTitleStyle: { color: colors.text } }}>
      <Stack.Screen name="PlaylistPicker" component={PlaylistPickerScreen} options={{ title: 'Playlists' }} />
      <Stack.Screen name="CadenceInput" component={CadenceInputScreen} options={{ title: 'Set cadence' }} />
      <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'Matches' }} />
    </Stack.Navigator>
  );
}
