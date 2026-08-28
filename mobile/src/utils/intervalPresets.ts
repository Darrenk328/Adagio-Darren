import type { Segment } from '../types/workout';

type Activity = 'running' | 'cycling';

function newId(): string {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A gentle 3-segment structure: easy warm-up, sustained tempo effort, easy cool-down. */
export function warmupTempoCooldownPreset(activity: Activity): Segment[] {
  const targets = activity === 'running' ? { warm: 150, tempo: 172, cool: 145 } : { warm: 70, tempo: 95, cool: 65 };
  return [
    { id: newId(), label: 'Warm-up', durationSec: 300, target: targets.warm },
    { id: newId(), label: 'Tempo', durationSec: 900, target: targets.tempo },
    { id: newId(), label: 'Cool-down', durationSec: 300, target: targets.cool },
  ];
}

/** 5 rounds of a 1-minute work effort followed by a 1-minute easier rest. */
export function fiveIntervalsPreset(activity: Activity): Segment[] {
  const work = activity === 'running' ? 180 : 100;
  const rest = activity === 'running' ? 150 : 70;
  const segments: Segment[] = [];
  for (let i = 1; i <= 5; i++) {
    segments.push({ id: newId(), label: `Work ${i}`, durationSec: 60, target: work });
    segments.push({ id: newId(), label: `Rest ${i}`, durationSec: 60, target: rest });
  }
  return segments;
}
