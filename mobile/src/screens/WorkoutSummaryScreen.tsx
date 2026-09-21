import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { formatDuration } from '../utils/duration';
import type { WorkoutStackParamList, CadenceSample } from '../navigation/WorkoutStack';
import type { PaceUnit } from '../utils/paceToCadence';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutSummary'>;

const METERS_PER_UNIT: Record<PaceUnit, number> = { mi: 1609.344, km: 1000 };
const SOURCE_LABEL: Record<string, string> = {
  none: 'No cadence source',
  garmin: 'Garmin Watch',
  healthkit: 'iPhone (HealthKit)',
  appleWatch: 'Apple Watch',
};

function formatPace(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Everything the run produced, computed from the samples Now Playing
 * recorded (one per live-cadence update) rather than re-queried from
 * HealthKit — so it reflects exactly what the app saw during the workout,
 * source-agnostic. Watch-only figures (pace, steps, distance) simply
 * don't render when the source didn't provide them.
 */
function summarize(samples: CadenceSample[], targetCadence: number | undefined, tolerance: number, paceUnit: PaceUnit) {
  if (samples.length === 0) return null;

  const cadences = samples.map((s) => s.cadence);
  const avgCadence = Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length);
  const minCadence = Math.min(...cadences);
  const maxCadence = Math.max(...cadences);

  const onPaceShare =
    targetCadence != null
      ? Math.round((cadences.filter((c) => Math.abs(c - targetCadence) <= tolerance).length / cadences.length) * 100)
      : null;

  // Pace/distance from speed samples. Distance integrates speed over the
  // gaps between consecutive samples (they arrive ~1 s apart) — an
  // estimate, but an honest one, and it doesn't count time standing still.
  const speedSamples = samples.filter((s): s is CadenceSample & { speedMps: number } => s.speedMps != null);
  let distanceMeters = 0;
  for (let i = 1; i < speedSamples.length; i++) {
    const dt = Math.min(speedSamples[i].t - speedSamples[i - 1].t, 5); // cap gaps (pauses) at 5 s
    if (dt > 0) distanceMeters += speedSamples[i].speedMps * dt;
  }
  const movingSpeeds = speedSamples.map((s) => s.speedMps).filter((v) => v > 0.2);
  const avgSpeed = movingSpeeds.length ? movingSpeeds.reduce((a, b) => a + b, 0) / movingSpeeds.length : null;
  const avgPaceSeconds = avgSpeed ? Math.round(METERS_PER_UNIT[paceUnit] / avgSpeed) : null;
  const distanceUnits = speedSamples.length >= 2 ? distanceMeters / METERS_PER_UNIT[paceUnit] : null;

  const stepSamples = samples.map((s) => s.steps).filter((v): v is number => v != null);
  const totalSteps = stepSamples.length ? Math.max(...stepSamples) : null;

  return { avgCadence, minCadence, maxCadence, onPaceShare, avgPaceSeconds, distanceUnits, totalSteps };
}

export default function WorkoutSummaryScreen({ route, navigation }: Props) {
  const {
    playlistName,
    durationSec,
    cadenceSource,
    unit,
    tolerance,
    targetCadence,
    segments,
    paceUnit,
    targetPaceSeconds,
    samples,
    songs,
  } = route.params;

  const stats = useMemo(
    () => summarize(samples, targetCadence, tolerance, paceUnit),
    [samples, targetCadence, tolerance, paceUnit],
  );

  const isInterval = !!segments && segments.length > 0;
  const hasWatchData = stats != null && (stats.totalSteps != null || stats.avgPaceSeconds != null);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Workout complete</Text>
        <Text style={styles.subtitle}>{playlistName}</Text>

        {/* Headline numbers */}
        <View style={styles.heroRow}>
          <Hero value={formatDuration(durationSec)} label="Duration" />
          <Hero value={String(songs.length)} label={songs.length === 1 ? 'Song' : 'Songs'} />
          {stats?.avgCadence != null && <Hero value={String(stats.avgCadence)} label={`Avg ${unit}`} />}
        </View>

        {/* Target */}
        <Section title="Target">
          {isInterval ? (
            segments!.map((seg, i) => (
              <Row key={seg.id} label={`${i + 1}. ${seg.label} · ${formatDuration(seg.durationSec)}`} value={`${seg.target} ${unit}`} />
            ))
          ) : (
            <>
              <Row label={`Cadence (±${tolerance})`} value={targetCadence != null ? `${targetCadence} ${unit}` : '—'} />
              {targetPaceSeconds != null && <Row label={`Pace /${paceUnit}`} value={formatPace(targetPaceSeconds)} />}
            </>
          )}
        </Section>

        {/* Cadence */}
        <Section title={`Cadence · ${SOURCE_LABEL[cadenceSource] ?? cadenceSource}`}>
          {stats ? (
            <>
              <Row label="Average" value={`${stats.avgCadence} ${unit}`} />
              <Row label="Range" value={`${stats.minCadence}–${stats.maxCadence} ${unit}`} />
              {stats.onPaceShare != null && (
                <Row
                  label="Time on pace"
                  value={`${stats.onPaceShare}%`}
                  valueStyle={stats.onPaceShare >= 70 ? styles.good : stats.onPaceShare >= 40 ? undefined : styles.bad}
                />
              )}
              <Row label="Readings" value={String(samples.length)} muted />
            </>
          ) : (
            <Text style={styles.empty}>
              {cadenceSource === 'none'
                ? 'No cadence source was selected for this workout.'
                : 'No cadence readings arrived during this workout.'}
            </Text>
          )}
        </Section>

        {/* Apple Watch extras */}
        {hasWatchData && (
          <Section title="From your Apple Watch">
            {stats!.avgPaceSeconds != null && (
              <Row
                label={`Avg pace /${paceUnit}`}
                value={
                  targetPaceSeconds != null
                    ? `${formatPace(stats!.avgPaceSeconds)}  (target ${formatPace(targetPaceSeconds)})`
                    : formatPace(stats!.avgPaceSeconds)
                }
              />
            )}
            {stats!.distanceUnits != null && (
              <Row label="Distance (est.)" value={`${stats!.distanceUnits.toFixed(2)} ${paceUnit}`} />
            )}
            {stats!.totalSteps != null && <Row label="Steps" value={stats!.totalSteps.toLocaleString()} />}
          </Section>
        )}

        {/* Songs */}
        <Section title="Songs played">
          {songs.length === 0 ? (
            <Text style={styles.empty}>No songs were played.</Text>
          ) : (
            songs.map((song, i) => (
              <View key={`${song.id}-${i}`} style={styles.songRow}>
                <Text style={styles.songIndex}>{i + 1}</Text>
                <View style={styles.songText}>
                  <Text style={styles.songTitle} numberOfLines={1}>
                    {song.title}
                  </Text>
                  <Text style={styles.songArtist} numberOfLines={1}>
                    {song.artist}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.doneButton} onPress={() => navigation.popToTop()}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Hero({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroValue}>{value}</Text>
      <Text style={styles.heroLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  muted,
  valueStyle,
}: {
  label: string;
  value: string;
  muted?: boolean;
  valueStyle?: object;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && styles.mutedText]}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.mutedText, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 4, marginBottom: 20 },
  heroRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  hero: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  heroValue: { fontSize: 24, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  heroLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10 },
  rowLabel: { fontSize: 15, color: colors.text, flexShrink: 0, marginRight: 12 },
  rowValue: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  mutedText: { color: colors.textMuted, fontWeight: '400' },
  good: { color: '#3CB371' },
  bad: { color: '#D64545' },
  empty: { fontSize: 14, color: colors.textMuted, paddingVertical: 12 },
  songRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  songIndex: { width: 22, fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  songText: { flex: 1 },
  songTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  songArtist: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  footer: { padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  doneButton: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  doneButtonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
});
