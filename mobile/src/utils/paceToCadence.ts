/**
 * Estimates a target running cadence (steps per minute) from a mile pace.
 *
 * Cadence isn't a precise function of pace — most recreational runners stay
 * within a fairly narrow ~155-190 spm band across a wide range of paces,
 * because speed increases mostly come from longer stride length, not much
 * higher step rate (this is well established in running-form literature,
 * e.g. Jack Daniels' and Reed Ferber's observations on cadence vs. pace in
 * recreational vs. elite runners). So instead of a straight-line formula, we
 * interpolate between published reference points spanning easy jogging pace
 * to fast/elite pace, and clamp to that same range at the extremes.
 *
 * This is a starting estimate, not a measurement — the UI keeps the
 * resulting cadence editable so the runner can correct it for their own
 * natural stride.
 */

// [pace in seconds/mile, typical cadence in steps/min]
const REFERENCE_POINTS: [paceSecPerMile: number, cadenceSpm: number][] = [
  [15 * 60, 152], // 15:00/mi — easy jog
  [12 * 60, 158], // 12:00/mi
  [10 * 60, 163], // 10:00/mi
  [8 * 60 + 34, 168], // 8:34/mi
  [7 * 60 + 30, 172], // 7:30/mi
  [6 * 60 + 40, 176], // 6:40/mi
  [6 * 60, 180], // 6:00/mi
  [5 * 60 + 27, 183], // 5:27/mi
  [5 * 60, 186], // 5:00/mi
  [4 * 60 + 17, 190], // 4:17/mi — fast/elite
];

/** Parses a "mm:ss" pace string into total seconds. Returns null if invalid. */
export function parsePaceString(input: string): number | null {
  const match = input.trim().match(/^(\d{1,2}):([0-5]?\d)$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const total = minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/** Estimates cadence (spm) from a mile pace, given in seconds per mile. */
export function estimateCadenceFromPace(paceSecPerMile: number): number {
  const points = REFERENCE_POINTS;

  // Pace and cadence move in opposite directions (slower pace = bigger
  // seconds/mile = lower cadence), so points are stored fastest-last;
  // walk them slowest-first for interpolation.
  const sorted = [...points].sort((a, b) => b[0] - a[0]);

  if (paceSecPerMile >= sorted[0][0]) return sorted[0][1];
  if (paceSecPerMile <= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1];

  for (let i = 0; i < sorted.length - 1; i++) {
    const [paceA, cadenceA] = sorted[i];
    const [paceB, cadenceB] = sorted[i + 1];
    if (paceSecPerMile <= paceA && paceSecPerMile >= paceB) {
      const t = (paceA - paceSecPerMile) / (paceA - paceB);
      return Math.round(cadenceA + t * (cadenceB - cadenceA));
    }
  }

  return sorted[sorted.length - 1][1]; // unreachable given the bounds checks above
}
