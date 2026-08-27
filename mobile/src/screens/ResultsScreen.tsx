import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { fetchPlaylistTracks, matchTracks, MatchedTrack } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>;

const TIER_LABEL: Record<MatchedTrack['matchTier'], string> = {
  exact: '',
  widened: 'wider range',
};

export default function ResultsScreen({ route }: Props) {
  const { playlistId, cadence, tolerance } = route.params;
  const { accessToken } = useAuth();
  const [matches, setMatches] = useState<MatchedTrack[]>([]);
  const [usedTolerance, setUsedTolerance] = useState(tolerance);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      try {
        const tracks = await fetchPlaylistTracks(accessToken, playlistId);
        const result = await matchTracks(tracks, cadence, tolerance);
        setMatches(result.matches);
        setUsedTolerance(result.tolerance);
      } catch (err) {
        setError('Could not load matching songs.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [accessToken, playlistId, cadence, tolerance]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.secondary} />
        <Text style={styles.loadingText}>Looking up tempos…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  const wasWidened = usedTolerance !== tolerance;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {matches.length} match{matches.length === 1 ? '' : 'es'} at {cadence} SPM (±{tolerance})
      </Text>
      {wasWidened && (
        <Text style={styles.subheader}>
          Not many exact matches, so some results below extend to ±{usedTolerance}.
        </Text>
      )}
      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.empty}>No matches found. Try widening the tolerance.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.albumArtUrl ? (
              <Image source={{ uri: item.albumArtUrl }} style={styles.art} />
            ) : (
              <View style={[styles.art, styles.artPlaceholder]} />
            )}
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSubtitle}>
                {item.artist}
                {TIER_LABEL[item.matchTier] ? ` · ${TIER_LABEL[item.matchTier]}` : ''}
              </Text>
            </View>
            <Text style={styles.bpm}>{Math.round(item.effectiveBpm)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 16 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textMuted, marginTop: 12 },
  header: { fontSize: 16, fontWeight: '600', color: colors.text, paddingHorizontal: 20, marginBottom: 4 },
  subheader: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 20, marginBottom: 12, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  art: { width: 44, height: 44, borderRadius: 6, marginRight: 12, backgroundColor: colors.border },
  artPlaceholder: {},
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  bpm: { fontSize: 15, fontWeight: '700', color: colors.secondary },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 24 },
  error: { color: colors.text, textAlign: 'center', paddingHorizontal: 24 },
});
