import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { formatDuration } from '../utils/duration';
import { useAuth } from '../auth/AuthContext';
import { useSettings } from '../settings/SettingsContext';
import {
  startPlayback,
  pausePlayback,
  resumePlayback,
  skipToNextTrack,
  fetchPlaylistTracks,
  matchTracks,
  NoActiveDeviceError,
  MatchedTrack,
} from '../api/client';
import type { WorkoutStackParamList } from '../navigation/WorkoutStack';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'NowPlaying'>;

type DeviceStatus = 'checking' | 'ready' | 'no-device' | 'error';

export default function NowPlayingScreen({ route }: Props) {
  const { playlistId, playlistName, segments, unit } = route.params;
  const { accessToken } = useAuth();
  const { defaultTolerance } = useSettings();

  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('checking');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [queue, setQueue] = useState<MatchedTrack[]>(route.params.queue);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [segmentRemainingSec, setSegmentRemainingSec] = useState(segments?.[0]?.durationSec ?? 0);
  const [segmentsComplete, setSegmentsComplete] = useState(false);
  const [isSwitchingSegment, setIsSwitchingSegment] = useState(false);
  const [transitionNotice, setTransitionNotice] = useState<string | null>(null);

  const currentTrack = queue[currentTrackIndex];
  const currentSegment = segments?.[segmentIndex];

  // isPlaying as a ref too, so the async segment-transition below can check
  // the *current* pause state even if the user paused mid-transition,
  // without the async callback closing over a stale value.
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const begin = useCallback(async () => {
    if (!accessToken) return;
    setDeviceStatus('checking');
    try {
      await startPlayback(
        accessToken,
        queue.map((t) => t.id),
      );
      setDeviceStatus('ready');
      setIsPlaying(true);
    } catch (err) {
      if (err instanceof NoActiveDeviceError) {
        setDeviceStatus('no-device');
      } else {
        console.error(err);
        setDeviceStatus('error');
      }
    }
  }, [accessToken, queue]);

  useEffect(() => {
    begin();
    // Only run once on mount — retries go through the explicit "Try again" button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single ticking clock driving both the overall elapsed counter and (if
  // this is an interval workout) the current segment's countdown. Only runs
  // while actually playing — pausing freezes both, nothing resets, and
  // (since this effect is torn down whenever isPlaying goes false) the
  // segment never advances while paused either.
  useEffect(() => {
    if (!isPlaying || deviceStatus !== 'ready') return;

    const interval = setInterval(() => {
      setElapsedSec((s) => s + 1);

      if (segments && segments.length > 0) {
        setSegmentRemainingSec((remaining) => {
          if (remaining > 1) return remaining - 1;

          // Segment finished — advance to the next one, if any.
          setSegmentIndex((idx) => {
            const nextIdx = idx + 1;
            if (nextIdx < segments.length) {
              return nextIdx;
            }
            setSegmentsComplete(true);
            return idx;
          });
          return 0;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, deviceStatus, segments]);

  // Re-matches songs to the new segment's target and swaps the playback
  // queue over — transitions immediately rather than waiting for the
  // current song to finish. Waiting would feel smoother, but the whole
  // point of an interval workout is hearing tempo-matched music exactly
  // when the target changes (e.g. fast music right as a work interval
  // starts) - delaying that until some arbitrary song boundary would
  // undercut the reason this app exists. The tradeoff is an audible cut
  // mid-song, which we accept.
  const transitionToSegment = useCallback(
    async (index: number) => {
      if (!accessToken || !segments) return;
      const target = segments[index];
      setIsSwitchingSegment(true);
      setTransitionNotice(null);
      try {
        const tracks = await fetchPlaylistTracks(accessToken, playlistId);
        const result = await matchTracks(tracks, target.target, defaultTolerance);

        if (result.matches.length === 0) {
          setTransitionNotice("No matches for this segment's target — keeping the current playlist going.");
          return;
        }

        setQueue(result.matches);
        setCurrentTrackIndex(0);
        await startPlayback(
          accessToken,
          result.matches.map((t) => t.id),
        );
        // If the user paused while this was in flight, honor that instead
        // of leaving the new queue playing out from under them.
        if (!isPlayingRef.current) {
          await pausePlayback(accessToken);
        }
      } catch (err) {
        if (err instanceof NoActiveDeviceError) {
          setDeviceStatus('no-device');
        } else {
          console.error(err);
          setTransitionNotice("Couldn't switch songs for this segment — keeping the current playlist going.");
        }
      } finally {
        setIsSwitchingSegment(false);
      }
    },
    [accessToken, playlistId, segments, defaultTolerance],
  );

  // When segmentIndex advances, load that segment's duration into the
  // countdown and kick off the re-match + queue swap above.
  const prevSegmentIndex = useRef(segmentIndex);
  useEffect(() => {
    if (prevSegmentIndex.current !== segmentIndex && segments) {
      setSegmentRemainingSec(segments[segmentIndex].durationSec);
      prevSegmentIndex.current = segmentIndex;
      transitionToSegment(segmentIndex);
    }
  }, [segmentIndex, segments, transitionToSegment]);

  const togglePause = async () => {
    if (!accessToken || isBusy) return;
    setIsBusy(true);
    try {
      if (isPlaying) {
        await pausePlayback(accessToken);
        setIsPlaying(false);
      } else {
        await resumePlayback(accessToken);
        setIsPlaying(true);
      }
    } catch (err) {
      if (err instanceof NoActiveDeviceError) {
        setDeviceStatus('no-device');
      } else {
        console.error(err);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSkip = async () => {
    if (!accessToken || isBusy) return;
    setIsBusy(true);
    try {
      await skipToNextTrack(accessToken);
      setCurrentTrackIndex((i) => (i + 1 < queue.length ? i + 1 : 0));
    } catch (err) {
      if (err instanceof NoActiveDeviceError) {
        setDeviceStatus('no-device');
      } else {
        console.error(err);
      }
    } finally {
      setIsBusy(false);
    }
  };

  if (deviceStatus === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.secondary} />
        <Text style={styles.loadingText}>Starting playback…</Text>
      </View>
    );
  }

  if (deviceStatus === 'no-device') {
    return (
      <View style={styles.center}>
        <Ionicons name="phone-portrait-outline" size={40} color={colors.textMuted} />
        <Text style={styles.noDeviceTitle}>No active Spotify device found</Text>
        <Text style={styles.noDeviceBody}>
          Open Spotify on your phone or speaker and start playing something, then come back here.
        </Text>
        <Pressable style={styles.button} onPress={begin}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (deviceStatus === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.noDeviceTitle}>Couldn't start playback</Text>
        <Pressable style={styles.button} onPress={begin}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.playlistName}>{playlistName}</Text>

      {currentTrack?.albumArtUrl ? (
        <Image source={{ uri: currentTrack.albumArtUrl }} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artPlaceholder]} />
      )}
      <Text style={styles.trackTitle}>{currentTrack?.title}</Text>
      <Text style={styles.trackArtist}>{currentTrack?.artist}</Text>

      {segments && segments.length > 0 && (
        <View style={styles.segmentCard}>
          {segmentsComplete ? (
            <Text style={styles.segmentComplete}>Workout complete 🎉</Text>
          ) : (
            <>
              <Text style={styles.segmentLabel}>
                Segment {segmentIndex + 1} of {segments.length} · {currentSegment?.label}
              </Text>
              <Text style={styles.segmentCountdown}>{formatDuration(segmentRemainingSec)}</Text>
              <Text style={styles.segmentTarget}>
                Target: {currentSegment?.target} {unit ?? ''}
              </Text>
              {isSwitchingSegment && (
                <View style={styles.switchingRow}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                  <Text style={styles.switchingText}>Finding songs for this segment…</Text>
                </View>
              )}
              {transitionNotice && !isSwitchingSegment && (
                <Text style={styles.transitionNotice}>{transitionNotice}</Text>
              )}
            </>
          )}
        </View>
      )}

      <Text style={styles.elapsedLabel}>Elapsed</Text>
      <Text style={styles.elapsedTime}>{formatDuration(elapsedSec)}</Text>

      <View style={styles.controls}>
        <Pressable style={styles.pauseButton} onPress={togglePause} disabled={isBusy}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color={colors.primaryText} />
        </Pressable>
        <Pressable style={styles.skipButton} onPress={handleSkip} disabled={isBusy}>
          <Ionicons name="play-skip-forward" size={26} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, alignItems: 'center' },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: { color: colors.textMuted, marginTop: 12 },
  noDeviceTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 16, textAlign: 'center' },
  noDeviceBody: { fontSize: 14, color: colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  playlistName: { fontSize: 14, color: colors.textMuted, marginTop: 8 },
  art: { width: 200, height: 200, borderRadius: 12, marginTop: 20, backgroundColor: colors.border },
  artPlaceholder: {},
  trackTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 16, textAlign: 'center' },
  trackArtist: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
  segmentCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
    alignItems: 'center',
  },
  segmentLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  segmentCountdown: { fontSize: 40, fontWeight: '700', color: colors.text, marginTop: 4 },
  segmentTarget: { fontSize: 13, color: colors.secondary, fontWeight: '600', marginTop: 4 },
  segmentComplete: { fontSize: 17, fontWeight: '700', color: colors.text },
  switchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  switchingText: { fontSize: 12, color: colors.textMuted },
  transitionNotice: { fontSize: 12, color: colors.textMuted, marginTop: 10, textAlign: 'center', lineHeight: 17 },
  elapsedLabel: { fontSize: 12, color: colors.textMuted, marginTop: 28, textTransform: 'uppercase', letterSpacing: 0.5 },
  elapsedTime: { fontSize: 22, fontWeight: '600', color: colors.text, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: 'auto', gap: 24, paddingBottom: 16 },
  pauseButton: {
    backgroundColor: colors.primary,
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    backgroundColor: colors.border,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: colors.secondary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 24,
  },
  buttonText: { color: colors.primaryText, fontSize: 15, fontWeight: '600' },
});
