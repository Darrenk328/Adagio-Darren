/**
 * Filter tracks to those whose tempo matches a target running cadence
 * (steps per minute), within a tolerance.
 *
 * Runners often step on every beat OR every half-beat depending on song
 * tempo, so a track is considered a match if its raw BPM, half BPM (double
 * time), or double BPM (half time) falls within range — e.g. a 90 BPM song
 * matches a 180 SPM cadence just as well as a 180 BPM song does.
 *
 * Tracks with unknown BPM (null) are excluded — we can't match what we
 * can't measure.
 */
export function matchTracksToCadence(tracks, cadence, tolerance) {
  const min = cadence - tolerance;
  const max = cadence + tolerance;

  const withDistance = tracks
    .filter((t) => typeof t.bpm === 'number' && t.bpm > 0)
    .map((t) => {
      const candidates = [t.bpm, t.bpm * 2, t.bpm / 2];
      let best = null;
      for (const c of candidates) {
        if (c >= min && c <= max) {
          const distance = Math.abs(c - cadence);
          if (!best || distance < best.distance) {
            best = { effectiveBpm: c, distance };
          }
        }
      }
      return best ? { ...t, effectiveBpm: best.effectiveBpm, distance: best.distance } : null;
    })
    .filter(Boolean);

  return withDistance.sort((a, b) => a.distance - b.distance);
}
