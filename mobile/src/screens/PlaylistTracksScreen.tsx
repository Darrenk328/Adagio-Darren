import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { fetchPlaylistTracks, Track } from '../api/client';
import * as AppleMusic from '../../modules/apple-music';
import { useAuth } from '../auth/AuthContext';
import type { WorkoutStackParamList } from '../navigation/WorkoutStack';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'PlaylistTracks'>;

// Plain, unmatched track listing for a playlist — lets you check what
// actually came back from a source before setting up a workout with it,
// rather than only finding out once matching runs. Deliberately simple:
// no cadence input here, just what's in the playlist and its BPM (or
// lack of one), same data the matching engine would see.
export default function PlaylistTracksScreen({ route }: Props) {
  const { playlistId, musicSource } = route.params;
  const { accessToken } = useAuth();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (musicSource === 'spotify' && !accessToken) return;
    (async () => {
      try {
        const result =
          musicSource === 'appleMusic'
            ? await AppleMusic.fetchPlaylistTracks(playlistId)
            : await fetchPlaylistTracks(accessToken!, playlistId);
        setTracks(result);
      } catch (err) {
        setError('Could not load songs. Pull to retry.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [playlistId, musicSource, accessToken]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.secondary} />
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

  const withBpm = tracks.filter((t) => typeof t.bpm === 'number').length;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {tracks.length} song{tracks.length === 1 ? '' : 's'} · {withBpm} with known tempo
      </Text>
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No songs found in this playlist.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.albumArtUrl ? (
              <Image source={{ uri: item.albumArtUrl }} style={styles.art} />
            ) : (
              <View style={[styles.art, styles.artPlaceholder]} />
            )}
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSubtitle}>{item.artist}</Text>
            </View>
            {item.bpm ? (
              <View style={styles.bpmBlock}>
                <Text style={styles.bpm}>{Math.round(item.bpm)} bpm</Text>
                {/* Runners step on the beat or the half-beat, so the same
                    song matches a cadence at half or double its raw BPM
                    too — same candidates matchTracksToCadence checks
                    server-side (backend/src/services/matching.js). */}
                <Text style={styles.bpmAlt}>
                  or {Math.round(item.bpm * 2)} / {Math.round(item.bpm / 2)} spm
                </Text>
              </View>
            ) : (
              <Text style={styles.bpmUnknown}>—</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 16 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  header: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 20, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  art: { width: 40, height: 40, borderRadius: 6, marginRight: 12, backgroundColor: colors.border },
  artPlaceholder: {},
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  bpmBlock: { alignItems: 'flex-end' },
  bpm: { fontSize: 14, fontWeight: '700', color: colors.secondary },
  bpmAlt: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  bpmUnknown: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 24 },
  error: { color: colors.text, textAlign: 'center', paddingHorizontal: 24 },
});
