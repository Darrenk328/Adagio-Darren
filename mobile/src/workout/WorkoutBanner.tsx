import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { formatDuration } from '../utils/duration';
import { useWorkoutSession } from './WorkoutSessionContext';
import { navigationRef } from '../navigation/navigationRef';

/**
 * Persistent "workout in progress" banner, rendered above the tab bar on
 * whichever tab the user is currently on. Only visible while
 * WorkoutSessionContext has an active session (see NowPlayingScreen, which
 * publishes/clears it) — i.e. a workout is running somewhere in the
 * background and the user has navigated away from NowPlaying without
 * ending it. Tapping it jumps to the Workout tab, which still has
 * NowPlayingScreen on top of its stack (tab switches don't unmount it),
 * so the user lands right back where they left off.
 */
export default function WorkoutBanner() {
  const { session } = useWorkoutSession();

  if (!session) return null;

  const handlePress = () => {
    if (navigationRef.isReady()) {
      // Cast: the ref is untyped at this call site since it's shared
      // outside the navigator's own param-list-aware context.
      (navigationRef as any).navigate('Workout');
    }
  };

  return (
    <Pressable style={styles.banner} onPress={handlePress}>
      <View style={styles.iconWrap}>
        <Ionicons name={session.isPlaying ? 'musical-notes' : 'pause'} size={16} color={colors.primaryText} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {session.playlistName}
        </Text>
        <Text style={styles.subtitle}>
          {session.isPlaying ? 'Workout in progress' : 'Paused'} · {formatDuration(session.elapsedSec)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.primaryText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(26,26,26,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: colors.primaryText },
  subtitle: { fontSize: 12, color: colors.primaryText, opacity: 0.75, marginTop: 1 },
});
