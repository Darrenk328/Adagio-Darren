import { useEffect, useRef } from 'react';
import * as Speech from 'expo-speech';
import { useLiveCadence } from './LiveCadenceContext';
import { getPlaybackState, setPlaybackVolume } from '../api/client';

// 3+ consecutive drifting readings before speaking up, and never more than
// once per ~25s even if drift persists — these are starting defaults per
// the plan; expect to tune both after real on-run testing.
const CONSECUTIVE_DRIFT_THRESHOLD = 3;
const MIN_NUDGE_INTERVAL_MS = 25_000;
const DUCK_VOLUME_PERCENT = 25;

type Params = {
  /** Current segment's target (interval workouts) or the single workout
   * target (see NowPlayingScreen). Undefined disables nudges entirely. */
  targetCadence: number | undefined;
  tolerance: number;
  /** Playing, device ready, and the workout isn't already finished — the
   * single gate that must be false to guarantee a nudge never fires while
   * paused. */
  active: boolean;
  accessToken: string | null;
};

/**
 * Speaks a brief coaching cue ("pick up the pace" / "ease off the pace")
 * when live Garmin cadence drifts outside the target ± tolerance range for
 * several consecutive readings while a workout is actively playing.
 * Ducks Spotify's volume for the duration of the cue via the Connect API
 * (best-effort — a failure to duck still lets the cue speak), then
 * restores it.
 *
 * No-ops entirely when cadenceSource isn't 'garmin': LiveCadenceContext
 * keeps currentCadence null in that case, so drift is never detected.
 */
export function useCadenceNudges({ targetCadence, tolerance, active, accessToken }: Params) {
  const { currentCadence, connectionStatus } = useLiveCadence();
  const driftCountRef = useRef(0);
  const lastNudgeAtRef = useRef(0);
  const speakingRef = useRef(false);

  useEffect(() => {
    if (!active || connectionStatus !== 'ready' || currentCadence == null || targetCadence == null) {
      driftCountRef.current = 0;
      return;
    }

    const diff = currentCadence - targetCadence;
    if (Math.abs(diff) <= tolerance) {
      driftCountRef.current = 0;
      return;
    }

    driftCountRef.current += 1;
    if (driftCountRef.current < CONSECUTIVE_DRIFT_THRESHOLD) return;

    const now = Date.now();
    if (now - lastNudgeAtRef.current < MIN_NUDGE_INTERVAL_MS) return;
    if (speakingRef.current || !accessToken) return;

    lastNudgeAtRef.current = now;
    driftCountRef.current = 0;
    const message = diff < 0 ? 'Pick up the pace a bit.' : 'Ease off the pace a bit.';
    void speakNudge(accessToken, message, speakingRef);
  }, [currentCadence, targetCadence, tolerance, active, connectionStatus, accessToken]);

  // If the workout stops being active mid-cue (paused, ended, screen torn
  // down), cut the cue off rather than let it finish talking over a
  // workout the user has already paused.
  useEffect(() => {
    if (!active) Speech.stop();
  }, [active]);
}

async function speakNudge(
  accessToken: string,
  message: string,
  speakingRef: React.MutableRefObject<boolean>,
): Promise<void> {
  speakingRef.current = true;
  let originalVolume: number | null = null;

  try {
    const state = await getPlaybackState(accessToken);
    originalVolume = state?.device?.volumePercent ?? null;
    if (originalVolume != null) {
      await setPlaybackVolume(accessToken, DUCK_VOLUME_PERCENT);
    }
  } catch {
    // Ducking is a nice-to-have — if it fails, still speak the cue over
    // full-volume music rather than skipping the nudge entirely.
  }

  const restore = () => {
    speakingRef.current = false;
    if (originalVolume != null) {
      setPlaybackVolume(accessToken, originalVolume).catch(() => {});
    }
  };

  Speech.speak(message, {
    onDone: restore,
    onStopped: restore,
    onError: restore,
  });
}
