/** Parses a "mm:ss" duration string into total seconds. Returns null if invalid. */
export function parseDurationString(input: string): number | null {
  const match = input.trim().match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const total = minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/** Formats total seconds as "mm:ss". */
export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
