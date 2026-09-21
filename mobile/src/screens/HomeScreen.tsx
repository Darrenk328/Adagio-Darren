import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/colors';
import { formatDuration } from '../utils/duration';
import type { MainTabParamList } from '../navigation/MainTabs';
import { useWorkoutHistory, type WorkoutRecord } from '../workout/WorkoutHistoryContext';

type Props = BottomTabScreenProps<MainTabParamList, 'Home'>;

const RECENT_LIMIT = 5;

const SOURCE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  none: 'musical-notes-outline',
  garmin: 'watch-outline',
  healthkit: 'phone-portrait-outline',
  appleWatch: 'watch-outline',
};

function formatWhen(endedAt: number): string {
  const d = new Date(endedAt);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + `, ${time}`;
}

function averageCadence(record: WorkoutRecord): number | null {
  if (record.samples.length === 0) return null;
  return Math.round(record.samples.reduce((sum, s) => sum + s.cadence, 0) / record.samples.length);
}

export default function HomeScreen({ navigation }: Props) {
  const { workouts, isLoading } = useWorkoutHistory();
  const recent = workouts.slice(0, RECENT_LIMIT);

  const openWorkout = (record: WorkoutRecord) => {
    // Push the summary onto the Workout tab's stack (on top of the picker,
    // so back/Done have somewhere sensible to go) and switch to that tab.
    navigation.navigate('Workout', {
      screen: 'WorkoutSummary',
      params: { ...record, fromHistory: true },
      initial: false,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Adagio</Text>
        <Text style={styles.subtitle}>Match your playlist to your running (or cycling) cadence</Text>

        <Pressable style={styles.button} onPress={() => navigation.navigate('Workout')}>
          <Text style={styles.buttonText}>Start a workout</Text>
        </Pressable>

        <View style={styles.recentSection}>
          <Text style={styles.recentLabel}>Recent</Text>

          {!isLoading && recent.length === 0 && (
            <Text style={styles.recentEmpty}>No workouts yet — start one to see it here.</Text>
          )}

          {recent.map((record) => {
            const avg = averageCadence(record);
            const songCount = record.songs.length;
            return (
              <Pressable
                key={record.id}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => openWorkout(record)}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name={SOURCE_ICON[record.cadenceSource] ?? 'walk-outline'} size={20} color={colors.secondary} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {record.playlistName}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {formatWhen(record.endedAt)}
                  </Text>
                  <Text style={styles.cardStats} numberOfLines={1}>
                    {formatDuration(record.durationSec)}
                    {avg != null ? `  ·  ${avg} ${record.unit} avg` : ''}
                    {`  ·  ${songCount} ${songCount === 1 ? 'song' : 'songs'}`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingTop: 32, paddingBottom: 32 },
  title: { fontSize: 34, fontWeight: '700', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.textMuted, marginBottom: 28, lineHeight: 21 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
  recentSection: { marginTop: 40 },
  recentLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  recentEmpty: { fontSize: 14, color: colors.textMuted },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardPressed: { opacity: 0.7 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cardStats: { fontSize: 13, color: colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
});
