import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import type { MatchedTrack } from '../api/client';
import type { MusicSource } from '../auth/AuthContext';
import type { CadenceSource } from '../settings/SettingsContext';
import type { Segment } from '../types/workout';
import type { PaceUnit } from '../utils/paceToCadence';

import PlaylistPickerScreen from '../screens/PlaylistPickerScreen';
import PlaylistTracksScreen from '../screens/PlaylistTracksScreen';
import WorkoutSetupScreen from '../screens/WorkoutSetupScreen';
import ResultsScreen from '../screens/ResultsScreen';
import NowPlayingScreen from '../screens/NowPlayingScreen';
import WorkoutSummaryScreen from '../screens/WorkoutSummaryScreen';

export type WorkoutStackParamList = {
  PlaylistPicker: undefined;
  // musicSource travels with the playlist so every downstream screen
  // (track fetching, matching, playback) knows which service it came
  // from without re-deriving it from AuthContext each time.
  PlaylistTracks: { playlistId: string; playlistName: string; musicSource: MusicSource };
  WorkoutSetup: { playlistId: string; playlistName: string; musicSource: MusicSource };
  Results: {
    playlistId: string;
    playlistName: string;
    musicSource: MusicSource;
    cadence: number;
    tolerance: number;
    unit: string;
    // The runner's chosen distance unit (mi/km) — running only. Carried
    // through so the Apple Watch can show pace in the unit they picked.
    paceUnit?: PaceUnit;
    // Only set when the workout was set up "By pace" rather than by
    // cadence: the pace they actually typed, in seconds per paceUnit.
    targetPaceSeconds?: number;
  };
  NowPlaying: {
    playlistId: string;
    playlistName: string;
    musicSource: MusicSource;
    queue: MatchedTrack[];
    segments?: Segment[];
    unit?: string;
    // Single-target workouts only — interval workouts get their target
    // from the current segment instead. Used for voice coaching nudges.
    targetCadence?: number;
    // See Results — forwarded to the Apple Watch's on-wrist readout.
    paceUnit?: PaceUnit;
    targetPaceSeconds?: number;
  };
  // Shown right after a workout ends (no back button, Done → picker) or
  // re-opened from Home's Recent list (fromHistory: back button, Done → Home).
  WorkoutSummary: WorkoutSummaryParams & { fromHistory?: boolean };
};

/** One live-cadence reading captured during the workout, for the summary. */
export type CadenceSample = {
  /** Seconds since the workout started. */
  t: number;
  cadence: number;
  /** Apple Watch only. */
  speedMps?: number;
  steps?: number;
};

export type PlayedSong = { id: string; title: string; artist: string };

export type WorkoutSummaryParams = {
  playlistName: string;
  durationSec: number;
  cadenceSource: CadenceSource;
  unit: string;
  tolerance: number;
  /** Single-target workouts; interval workouts report per-segment targets instead. */
  targetCadence?: number;
  segments?: Segment[];
  paceUnit: PaceUnit;
  targetPaceSeconds?: number;
  samples: CadenceSample[];
  songs: PlayedSong[];
};

const Stack = createNativeStackNavigator<WorkoutStackParamList>();

export default function WorkoutStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTitleStyle: { color: colors.text } }}>
      <Stack.Screen name="PlaylistPicker" component={PlaylistPickerScreen} options={{ title: 'Playlists' }} />
      <Stack.Screen name="PlaylistTracks" component={PlaylistTracksScreen} options={{ title: 'Songs' }} />
      <Stack.Screen name="WorkoutSetup" component={WorkoutSetupScreen} options={{ title: 'Set up workout' }} />
      <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'Matches' }} />
      <Stack.Screen name="NowPlaying" component={NowPlayingScreen} options={{ title: 'Now Playing' }} />
      <Stack.Screen
        name="WorkoutSummary"
        component={WorkoutSummaryScreen}
        // No back button: the workout it came from has been ended and
        // replaced; "Done" at the bottom returns to the playlist picker.
        options={{ title: 'Workout Summary', headerBackVisible: false, gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
