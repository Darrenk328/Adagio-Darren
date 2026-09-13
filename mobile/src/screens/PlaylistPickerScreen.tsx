import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fetchPlaylists, Playlist } from '../api/client';
import * as AppleMusic from '../../modules/apple-music';
import { useAuth } from '../auth/AuthContext';
import type { WorkoutStackParamList } from '../navigation/WorkoutStack';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'PlaylistPicker'>;

export default function PlaylistPickerScreen({ navigation }: Props) {
  const { accessToken, musicSource } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (musicSource === 'spotify') {
      if (!accessToken) return;
      fetchPlaylists(accessToken)
        .then(setPlaylists)
        .catch(() => setError('Could not load your playlists. Pull down to retry.'))
        .finally(() => setIsLoading(false));
    } else if (musicSource === 'appleMusic') {
      // trackCount comes back 0 here — a library-request result doesn't
      // include a playlist's tracks (see modules/apple-music's
      // AppleMusicModule.swift); the real count only appears after
      // fetchPlaylistTracks loads that specific playlist.
      AppleMusic.fetchPlaylists()
        .then(setPlaylists)
        .catch(() => setError('Could not load your Apple Music playlists. Pull down to retry.'))
        .finally(() => setIsLoading(false));
    } else {
      // No connected music source — shouldn't normally be reachable
      // (AppNavigator gates on one being set), but fail visibly rather
      // than spin forever if it happens anyway.
      setError('No connected music service.');
      setIsLoading(false);
    }
  }, [accessToken, musicSource]);

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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Pick a playlist</Text>
      <FlatList
        data={playlists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate('WorkoutSetup', { playlistId: item.id, playlistName: item.name, musicSource })
            }
          >
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.art} />
            ) : (
              <View style={[styles.art, styles.artPlaceholder]} />
            )}
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              {musicSource === 'spotify' && <Text style={styles.rowSubtitle}>{item.trackCount} tracks</Text>}
            </View>
            <Pressable
              hitSlop={12}
              style={styles.viewSongsButton}
              onPress={() =>
                navigation.navigate('PlaylistTracks', { playlistId: item.id, playlistName: item.name, musicSource })
              }
            >
              <Ionicons name="list-outline" size={22} color={colors.textMuted} />
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 16 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  header: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: 20, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  art: { width: 48, height: 48, borderRadius: 6, marginRight: 12, backgroundColor: colors.border },
  artPlaceholder: {},
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  viewSongsButton: { padding: 8 },
  error: { color: colors.text, textAlign: 'center', paddingHorizontal: 24 },
});
