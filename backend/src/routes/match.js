import { Router } from 'express';
import { matchTracksToCadence } from '../services/matching.js';

const router = Router();

// Below this many exact matches, cascade to wider tolerances until we hit
// this count or run out of cascade steps.
const MIN_DESIRED_MATCHES = 8;
// ±5 → ±10 → ±15 → ±20 when the requested tolerance is 5, etc.
const CASCADE_MULTIPLIERS = [1, 2, 3, 4];

// body: { tracks: [{ id, title, artist, bpm }], cadence: number, tolerance: number }
router.post('/', (req, res) => {
  const { tracks, cadence, tolerance } = req.body;

  if (!Array.isArray(tracks)) return res.status(400).json({ error: '"tracks" must be an array' });
  if (typeof cadence !== 'number') return res.status(400).json({ error: '"cadence" must be a number' });
  if (typeof tolerance !== 'number') return res.status(400).json({ error: '"tolerance" must be a number' });

  let matches = [];
  let usedTolerance = tolerance;

  for (const multiplier of CASCADE_MULTIPLIERS) {
    const candidateTolerance = tolerance * multiplier;
    const attempt = matchTracksToCadence(tracks, cadence, candidateTolerance);

    // Anything outside the *originally requested* tolerance is only a match
    // because we widened — tag it so the UI can show that distinction.
    matches = attempt.map((m) => ({ ...m, matchTier: m.distance > tolerance ? 'widened' : 'exact' }));
    usedTolerance = candidateTolerance;

    if (matches.length >= MIN_DESIRED_MATCHES) break;
  }

  res.json({ matches, tolerance: usedTolerance });
});

export default router;
