import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { formatDuration } from '../utils/duration';
import { useAuth } from '../auth/AuthContext';
import { useSettings, type CadenceSource } from '../settings/SettingsContext';
import { useWorkoutSession } from '../workout/WorkoutSessionContext';
import { useCadenceNudges } from '../cadence/useCadenceNudges';
import { useLiveCadence } from '../cadence/LiveCadenceContext';
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
import * as AppleMusic from '../../modules/apple-music';
import type { WorkoutStackParamList, CadenceSample, PlayedSong, WorkoutSummaryParams } from '../navigation/WorkoutStack';
import { useWorkoutHistory } from '../workout/WorkoutHistoryContext';
import type { PaceUnit } from '../utils/paceToCadence';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'NowPlaying'>;

type DeviceStatus = 'checking' | 'ready' | 'no-device' | 'error';

export default function NowPlayingScreen({ route, navigation }: Props) {
  const { playlistId, playlistName, musicSource, segments, unit, targetCadence, paceUnit, targetPaceSeconds } =
    route.params;
  const { accessToken } = useAuth();
  const isAppleMusic = musicSource === 'appleMusic';
  const { defaultTolerance, cadenceSource } = useSettings();
  const { setSession } = useWorkoutSession();
  const {
    startTracking,
    stopTracking,
    setTargetCadence,
    endWorkout: endCadenceWorkout,
    startWatchWorkout,
    watchStatus,
    openGarminApp,
    connectionStatus,
    currentCadence,
    currentSteps,
    currentSpeedMps,
    deviceName,
  } = useLiveCadence();
  const isFocused = useIsFocused();

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

  // Interval workouts take their target from the current segment;
  // single-target workouts carry it as a route param instead (see
  // ResultsScreen). Either way, voice nudges only need one number.
  const activeTargetCadence = currentSegment?.target ?? targetCadence;

  useCadenceNudges({
    targetCadence: activeTargetCadence,
    tolerance: defaultTolerance,
    active: isPlaying && deviceStatus === 'ready' && !segmentsComplete,
    accessToken,
  });

  // isPlaying as a ref too, so the async segment-transition below can check
  // the *current* pause state even if the user paused mid-transition,
  // without the async callback closing over a stale value.
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Everything the summary screen is built from, recorded as it happens.
  // Refs, not state: these grow every second and nothing renders them.
  const { addWorkout } = useWorkoutHistory();
  const samplesRef = useRef<CadenceSample[]>([]);
  const songsRef = useRef<PlayedSong[]>([]);
  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = elapsedSec;
  }, [elapsedSec]);

  // One sample per live-cadence update while the workout is actually
  // running (not paused, not before playback started), stamped with the
  // workout clock. Watch extras ride along when present.
  useEffect(() => {
    if (currentCadence == null || !isPlaying || deviceStatus !== 'ready') return;
    samplesRef.current.push({
      t: elapsedRef.current,
      cadence: currentCadence,
      ...(currentSpeedMps != null ? { speedMps: currentSpeedMps } : {}),
      ...(currentSteps != null ? { steps: currentSteps } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCadence, currentSpeedMps, currentSteps]);

  // Songs in the order they actually played — a new entry whenever the
  // current track changes (skip, or a segment swapping the queue), not
  // the matched queue as planned.
  useEffect(() => {
    if (!currentTrack || deviceStatus !== 'ready') return;
    const last = songsRef.current[songsRef.current.length - 1];
    if (last?.id === currentTrack.id) return;
    songsRef.current.push({ id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist });
  }, [currentTrack, deviceStatus]);

  // Publish a minimal "workout in progress" signal for the persistent
  // banner shown on other tabs — only while there's actually something
  // playing (not during the initial device check/error states, and not
  // once all segments have finished) AND this screen itself isn't the one
  // on screen (no point banner-ing your way back to where you already are).
  // Cleared unconditionally on unmount so navigating back via the header
  // always dismisses the banner, even before this effect re-runs.
  useEffect(() => {
    if (deviceStatus === 'ready' && !segmentsComplete && !isFocused) {
      setSession({ playlistName, isPlaying, elapsedSec });
    } else {
      setSession(null);
    }
  }, [deviceStatus, segmentsComplete, isFocused, isPlaying, elapsedSec, playlistName, setSession]);

  useEffect(() => {
    return () => setSession(null);
  }, [setSession]);

  const begin = useCallback(async () => {
    if (!isAppleMusic && !accessToken) return;
    setDeviceStatus('checking');
    try {
      if (isAppleMusic) {
        // No "no active device" concept for Apple Music — MusicKit plays
        // right here on this device, unlike Spotify Connect controlling
        // a separate remote device.
        await AppleMusic.play(queue.map((t) => t.id));
      } else {
        await startPlayback(
          accessToken!,
          queue.map((t) => t.id),
        );
      }
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
  }, [accessToken, isAppleMusic, queue]);

  useEffect(() => {
    begin();
    // Only run once on mount — retries go through the explicit "Try again" button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HealthKit's HKWorkoutSession is workout-scoped (unlike Garmin's
  // ambient BLE connection, which the Settings screen manages on its
  // own) — start it exactly when this workout starts, stop it exactly
  // when this screen goes away, regardless of how that happens (finished
  // segments, navigating back, killing the app mid-run). No-ops when
  // cadenceSource isn't 'healthkit' — see LiveCadenceContext.
  useEffect(() => {
    if (cadenceSource !== 'healthkit') return;
    startTracking().catch((err) => console.error('[NowPlayingScreen] startTracking failed:', err));
    return () => {
      stopTracking().catch((err) => console.error('[NowPlayingScreen] stopTracking failed:', err));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadenceSource]);

  // Apple Watch: launch the Watch app into a workout from here so the
  // runner never has to start it on the wrist. startWatchWorkout resolves
  // when watchOS accepts the launch; the mirrored session then arrives as
  // connectionStatus 'ready'. Until it does, keep retrying — the Watch may
  // be asleep, out of range, or still authorizing — and after a few
  // failed rounds tell the user what to do about it.
  const [watchError, setWatchError] = useState<string | null>(null);
  const watchAttemptsRef = useRef(0);
  const isWatchConnected = connectionStatus === 'ready';
  useEffect(() => {
    if (cadenceSource !== 'appleWatch' && cadenceSource !== 'garmin') return;
    if (isWatchConnected) {
      setWatchError(null);
      watchAttemptsRef.current = 0;
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Apple: the phone launches the Watch app outright, so retrying is
    // free and silent. Garmin: each attempt puts a confirmation prompt on
    // the watch face, so retry far more slowly — spamming prompts at a
    // runner would be worse than useless.
    const isGarmin = cadenceSource === 'garmin';
    const attempt = async () => {
      if (cancelled) return;
      watchAttemptsRef.current += 1;
      let problem: string | null = null;
      try {
        if (isGarmin) problem = await openGarminApp();
        else await startWatchWorkout();
      } catch (err) {
        console.warn('[NowPlayingScreen] watch auto-start failed:', err);
      }
      if (cancelled) return;

      if (isGarmin) {
        // Garmin tells us exactly what went wrong on the first try, so
        // show it immediately rather than after N silent rounds.
        setWatchError(
          problem ??
            (watchAttemptsRef.current === 1
              ? 'Tap “Yes” on your Garmin watch to start tracking.'
              : 'Waiting for your Garmin watch — tap “Yes” on the prompt, or open Adagio on the watch.'),
        );
      } else if (watchAttemptsRef.current >= WATCH_ATTEMPTS_BEFORE_ERROR) {
        setWatchError(
          watchStatus && !watchStatus.paired
            ? 'No Apple Watch is paired with this iPhone.'
            : watchStatus && !watchStatus.appInstalled
              ? 'Adagio isn’t installed on your Apple Watch. Install it from the Watch app on your iPhone.'
              : 'Couldn’t connect to your Apple Watch. Go to Settings and reconnect Apple Watch, or open Adagio on the Watch and tap Start.',
        );
      }

      // Slow down once we've told them, but never stop trying — it'll
      // connect the moment the watch comes back in range.
      const delay = isGarmin
        ? GARMIN_RETRY_MS
        : watchAttemptsRef.current >= WATCH_ATTEMPTS_BEFORE_ERROR
          ? 15_000
          : 6_000;
      timer = setTimeout(attempt, delay);
    };
    void attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadenceSource, isWatchConnected]);

  // Keep the Apple Watch told what the target is so it can show
  // live-vs-target on the wrist: re-sent whenever the active target
  // changes (segment transitions included), cleared when this screen goes
  // away. The target pace only exists for single-target "By pace" setups;
  // interval segments are cadence-only, so the Watch gets just the unit.
  const isSingleTarget = !segments || segments.length === 0;
  useEffect(() => {
    if (cadenceSource !== 'appleWatch') return;
    setTargetCadence(activeTargetCadence ?? null, defaultTolerance, {
      paceUnit,
      targetPaceSeconds: isSingleTarget ? targetPaceSeconds : undefined,
    }).catch((err) => console.error('[NowPlayingScreen] setTargetCadence failed:', err));
    return () => {
      setTargetCadence(null, defaultTolerance, { paceUnit }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadenceSource, activeTargetCadence, defaultTolerance, paceUnit, targetPaceSeconds, isSingleTarget]);

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
      if (!isAppleMusic && !accessToken) return;
      if (!segments) return;
      const target = segments[index];
      setIsSwitchingSegment(true);
      setTransitionNotice(null);
      try {
        const tracks = isAppleMusic
          ? await AppleMusic.fetchPlaylistTracks(playlistId)
          : await fetchPlaylistTracks(accessToken!, playlistId);
        const result = await matchTracks(tracks, target.target, defaultTolerance);

        if (result.matches.length === 0) {
          setTransitionNotice("No matches for this segment's target — keeping the current playlist going.");
          return;
        }

        setQueue(result.matches);
        setCurrentTrackIndex(0);

        if (isAppleMusic) {
          await AppleMusic.play(result.matches.map((t) => t.id));
          if (!isPlayingRef.current) AppleMusic.pause();
        } else {
          await startPlayback(
            accessToken!,
            result.matches.map((t) => t.id),
          );
          // If the user paused while this was in flight, honor that
          // instead of leaving the new queue playing out from under them.
          if (!isPlayingRef.current) {
            await pausePlayback(accessToken!);
          }
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
    [accessToken, isAppleMusic, playlistId, segments, defaultTolerance],
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

  const finishWorkout = async () => {
    setIsBusy(true);
    try {
      // Stop the music; failures here shouldn't stop the summary from showing.
      if (isPlaying) {
        if (isAppleMusic) AppleMusic.pause();
        else if (accessToken) await pausePlayback(accessToken).catch(() => {});
      }
      setIsPlaying(false);
      // Ends the iPhone-owned HealthKit session or asks the Watch to end
      // its own — no-op for Garmin, whose connection isn't per-workout.
      await endCadenceWorkout().catch((err) => console.error('[NowPlayingScreen] endWorkout failed:', err));
    } finally {
      setIsBusy(false);
    }

    const summary: WorkoutSummaryParams = {
      playlistName,
      durationSec: elapsedRef.current,
      cadenceSource,
      unit: unit ?? 'spm',
      tolerance: defaultTolerance,
      targetCadence,
      segments,
      paceUnit: paceUnit ?? 'mi',
      targetPaceSeconds: isSingleTarget ? targetPaceSeconds : undefined,
      samples: samplesRef.current,
      songs: songsRef.current,
    };
    // Saved first so it's on Home's Recent list even if the user backs
    // out of the summary immediately.
    await addWorkout(summary).catch((err) => console.error('[NowPlayingScreen] addWorkout failed:', err));

    // replace, not navigate: this workout is over, so there's nothing to
    // come "back" to. Done on the summary pops to the playlist picker.
    navigation.replace('WorkoutSummary', summary);
  };

  const confirmEndWorkout = () => {
    Alert.alert('End workout?', 'Playback will stop and you’ll see your summary.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End workout', style: 'destructive', onPress: () => void finishWorkout() },
    ]);
  };

  const togglePause = async () => {
    if (!isAppleMusic && !accessToken) return;
    if (isBusy) return;
    setIsBusy(true);
    try {
      if (isPlaying) {
        if (isAppleMusic) AppleMusic.pause();
        else await pausePlayback(accessToken!);
        setIsPlaying(false);
      } else {
        if (isAppleMusic) await AppleMusic.resume();
        else await resumePlayback(accessToken!);
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
    if (!isAppleMusic && !accessToken) return;
    if (isBusy) return;
    setIsBusy(true);
    try {
      if (isAppleMusic) await AppleMusic.skipToNext();
      else await skipToNextTrack(accessToken!);
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Compact now-playing header: art beside the text instead of a
            200pt square above it, so the segment and cadence cards fit
            without pushing the controls off-screen. */}
        <View style={styles.nowPlayingRow}>
          {currentTrack?.albumArtUrl ? (
            <Image source={{ uri: currentTrack.albumArtUrl }} style={styles.art} />
          ) : (
            <View style={[styles.art, styles.artPlaceholder]} />
          )}
          <View style={styles.nowPlayingText}>
            <Text style={styles.playlistName} numberOfLines={1}>
              {playlistName}
            </Text>
            <Text style={styles.trackTitle} numberOfLines={2}>
              {currentTrack?.title}
            </Text>
            <Text style={styles.trackArtist} numberOfLines={1}>
              {currentTrack?.artist}
            </Text>
          </View>
        </View>

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

        {cadenceSource !== 'none' && (
          <LiveCadenceCard
            cadenceSource={cadenceSource}
            deviceName={deviceName}
            connectionStatus={connectionStatus}
            currentCadence={currentCadence}
            targetCadence={activeTargetCadence}
            tolerance={defaultTolerance}
            unit={unit ?? 'spm'}
            steps={currentSteps}
            speedMps={currentSpeedMps}
            paceUnit={paceUnit ?? 'mi'}
            targetPaceSeconds={isSingleTarget ? targetPaceSeconds : undefined}
            errorMessage={watchError}
          />
        )}
      </ScrollView>

      {/* Pinned footer: elapsed + transport + end. Never scrolls away. */}
      <View style={styles.footer}>
        <View style={styles.elapsedBlock}>
          <Text style={styles.elapsedLabel}>Elapsed</Text>
          <Text style={styles.elapsedTime}>{formatDuration(elapsedSec)}</Text>
        </View>
        <View style={styles.controls}>
          <Pressable style={styles.skipButton} onPress={handleSkip} disabled={isBusy}>
            <Ionicons name="play-skip-forward" size={24} color={colors.text} />
          </Pressable>
          <Pressable style={styles.pauseButton} onPress={togglePause} disabled={isBusy}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color={colors.primaryText} />
          </Pressable>
          <Pressable style={styles.endButton} onPress={confirmEndWorkout} disabled={isBusy}>
            <Ionicons name="stop" size={22} color="#D64545" />
          </Pressable>
        </View>
        <Text style={styles.endHint}>Stop ends the workout and shows your summary</Text>
      </View>
    </View>
  );
}

const SOURCE_LABEL: Record<Exclude<CadenceSource, 'none'>, string> = {
  garmin: 'Garmin',
  healthkit: 'iPhone (HealthKit)',
  appleWatch: 'Apple Watch',
};

// Only 'ready' means cadence is actually flowing — everything else is
// some flavor of "not yet" (see LiveCadenceContext; HealthKit's 'tracking'
// is normalized to 'ready' there too).
const CADENCE_STATUS_LABEL: Record<string, string> = {
  idle: 'Waiting…',
  ready: 'Live',
  connected: 'Connecting…',
  found: 'Connecting…',
  opening: 'Opening Garmin Connect…',
  needsGCM: 'Garmin Connect not installed',
  notConnected: 'Not connected',
  bluetoothNotReady: 'Bluetooth off',
  notFound: 'Watch not found',
  stopped: 'Not tracking',
  error: 'Error',
  unavailable: 'Needs iOS 26+',
};

/**
 * In-workout view of the live cadence feed — the one place you can see,
 * during a run, that data is actually arriving from the selected source
 * and how it compares to the target. Before this, the only readout was on
 * the Settings tab, which isn't visible mid-workout, so there was no way
 * to tell whether nudges were silent because pace was fine or because no
 * data was flowing at all.
 */
/** Auto-start rounds (~6 s apart) before the card tells the runner what to do. */
const WATCH_ATTEMPTS_BEFORE_ERROR = 3;
/** Garmin re-ask interval. Long on purpose: every attempt shows a prompt on the watch. */
const GARMIN_RETRY_MS = 30_000;

const METERS_PER_UNIT: Record<PaceUnit, number> = { mi: 1609.344, km: 1000 };

function formatPace(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function LiveCadenceCard({
  cadenceSource,
  deviceName,
  connectionStatus,
  currentCadence,
  targetCadence,
  tolerance,
  unit,
  steps,
  speedMps,
  paceUnit,
  targetPaceSeconds,
  errorMessage,
}: {
  cadenceSource: Exclude<CadenceSource, 'none'>;
  deviceName: string | null;
  connectionStatus: string;
  currentCadence: number | null;
  targetCadence: number | undefined;
  tolerance: number;
  unit: string;
  /** Apple Watch only; null for Garmin / iPhone HealthKit. */
  steps: number | null;
  speedMps: number | null;
  /** The unit the runner chose in Workout Setup — pace is always shown in it. */
  paceUnit: PaceUnit;
  /** Only when the workout was set up "By pace". Seconds per paceUnit. */
  targetPaceSeconds: number | undefined;
  /** Shown under the numbers when the source can't be reached (Apple Watch auto-start). */
  errorMessage?: string | null;
}) {
  const isLive = connectionStatus === 'ready';
  const diff = currentCadence != null && targetCadence != null ? currentCadence - targetCadence : null;
  const withinTolerance = diff != null && Math.abs(diff) <= tolerance;

  // Pace from the Watch's running speed, in the runner's unit. Below
  // ~0.2 m/s they're standing still — no meaningful pace.
  const paceSeconds =
    speedMps != null && speedMps > 0.2 ? Math.round(METERS_PER_UNIT[paceUnit] / speedMps) : null;
  const paceDelta = paceSeconds != null && targetPaceSeconds != null ? paceSeconds - targetPaceSeconds : null;
  // 15 s per mile/km is the "close enough" band for pace, mirroring the
  // cadence tolerance's role. Positive delta = slower than target.
  const paceOnTarget = paceDelta != null && Math.abs(paceDelta) <= 15;
  const hasWatchExtras = steps != null || speedMps != null;

  return (
    <View style={styles.cadenceCard}>
      <View style={styles.cadenceHeader}>
        <Text style={styles.cadenceSource}>{deviceName ?? SOURCE_LABEL[cadenceSource]}</Text>
        <View style={styles.cadenceStatusRow}>
          <View style={[styles.cadenceDot, isLive ? styles.cadenceDotLive : styles.cadenceDotIdle]} />
          <Text style={styles.cadenceStatus}>{CADENCE_STATUS_LABEL[connectionStatus] ?? connectionStatus}</Text>
        </View>
      </View>

      <View style={styles.cadenceNumbers}>
        <View style={styles.cadenceStat}>
          <Text style={styles.cadenceValue}>{currentCadence ?? '—'}</Text>
          <Text style={styles.cadenceStatLabel}>Live {unit}</Text>
        </View>
        <View style={styles.cadenceStat}>
          <Text style={styles.cadenceValue}>{targetCadence ?? '—'}</Text>
          <Text style={styles.cadenceStatLabel}>Target</Text>
        </View>
        <View style={styles.cadenceStat}>
          <Text
            style={[
              styles.cadenceValue,
              diff != null && (withinTolerance ? styles.cadenceOnPace : styles.cadenceOffPace),
            ]}
          >
            {diff == null ? '—' : `${diff > 0 ? '+' : ''}${diff}`}
          </Text>
          <Text style={styles.cadenceStatLabel}>{diff == null ? 'Δ' : withinTolerance ? 'On pace' : 'Off pace'}</Text>
        </View>
      </View>

      {/* Second row: Apple Watch extras. Pace is in the runner's unit; the
          target pace column only exists for "By pace" setups. */}
      {hasWatchExtras && (
        <View style={[styles.cadenceNumbers, styles.cadenceSecondRow]}>
          <View style={styles.cadenceStat}>
            <Text style={styles.cadenceValueSmall}>{paceSeconds != null ? formatPace(paceSeconds) : '—:—'}</Text>
            <Text style={styles.cadenceStatLabel}>Pace /{paceUnit}</Text>
          </View>
          {targetPaceSeconds != null && (
            <>
              <View style={styles.cadenceStat}>
                <Text style={styles.cadenceValueSmall}>{formatPace(targetPaceSeconds)}</Text>
                <Text style={styles.cadenceStatLabel}>Target /{paceUnit}</Text>
              </View>
              <View style={styles.cadenceStat}>
                <Text
                  style={[
                    styles.cadenceValueSmall,
                    paceDelta != null && (paceOnTarget ? styles.cadenceOnPace : styles.cadenceOffPace),
                  ]}
                >
                  {paceDelta == null ? '—' : `${paceDelta > 0 ? '+' : paceDelta < 0 ? '−' : ''}${formatPace(Math.abs(paceDelta))}`}
                </Text>
                <Text style={styles.cadenceStatLabel}>{paceDelta == null ? 'Δ pace' : paceDelta > 0 ? 'Slow' : paceDelta < 0 ? 'Fast' : 'On'}</Text>
              </View>
            </>
          )}
          <View style={styles.cadenceStat}>
            <Text style={styles.cadenceValueSmall}>{steps != null ? steps.toLocaleString() : '—'}</Text>
            <Text style={styles.cadenceStatLabel}>Steps</Text>
          </View>
        </View>
      )}

      {errorMessage && (
        <View style={styles.cadenceErrorRow}>
          <Ionicons name="alert-circle-outline" size={16} color="#D64545" />
          <Text style={styles.cadenceErrorText}>{errorMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 12 },
  nowPlayingRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nowPlayingText: { flex: 1, minWidth: 0 },
  cadenceCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  cadenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cadenceSource: { fontSize: 13, fontWeight: '600', color: colors.text },
  cadenceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cadenceDot: { width: 8, height: 8, borderRadius: 4 },
  cadenceDotLive: { backgroundColor: '#3CB371' },
  cadenceDotIdle: { backgroundColor: colors.textMuted },
  cadenceStatus: { fontSize: 12, color: colors.textMuted },
  cadenceNumbers: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  cadenceStat: { alignItems: 'center', minWidth: 72 },
  cadenceValue: { fontSize: 26, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  cadenceStatLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  cadenceSecondRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  cadenceValueSmall: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  cadenceOnPace: { color: '#3CB371' },
  cadenceOffPace: { color: '#D64545' },
  cadenceErrorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cadenceErrorText: { flex: 1, fontSize: 12, lineHeight: 16, color: '#D64545' },
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
  playlistName: { fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  art: { width: 84, height: 84, borderRadius: 10, backgroundColor: colors.border },
  artPlaceholder: {},
  trackTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  trackArtist: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  segmentCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
  },
  segmentLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  segmentCountdown: { fontSize: 40, fontWeight: '700', color: colors.text, marginTop: 4 },
  segmentTarget: { fontSize: 13, color: colors.secondary, fontWeight: '600', marginTop: 4 },
  segmentComplete: { fontSize: 17, fontWeight: '700', color: colors.text },
  switchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  switchingText: { fontSize: 12, color: colors.textMuted },
  transitionNotice: { fontSize: 12, color: colors.textMuted, marginTop: 10, textAlign: 'center', lineHeight: 17 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  elapsedBlock: { alignItems: 'center', marginBottom: 8 },
  elapsedLabel: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  elapsedTime: { fontSize: 22, fontWeight: '600', color: colors.text, marginTop: 1, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  pauseButton: {
    backgroundColor: colors.primary,
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    backgroundColor: colors.border,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#D64545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endHint: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  button: {
    backgroundColor: colors.secondary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 24,
  },
  buttonText: { color: colors.primaryText, fontSize: 15, fontWeight: '600' },
});
