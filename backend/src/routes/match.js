import { Router } from 'express';
import { matchTracksToCadence } from '../services/matching.js';

const router = Router();

// body: { tracks: [{ id, title, artist, bpm }], cadence: number, tolerance: number }
router.post('/', (req, res) => {
  const { tracks, cadence, tolerance } = req.body;

  if (!Array.isArray(tracks)) return res.status(400).json({ error: '"tracks" must be an array' });
  if (typeof cadence !== 'number') return res.status(400).json({ error: '"cadence" must be a number' });
  if (typeof tolerance !== 'number') return res.status(400).json({ error: '"tolerance" must be a number' });

  const matches = matchTracksToCadence(tracks, cadence, tolerance);
  res.json(matches);
});

export default router;
