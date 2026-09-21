import { Router } from 'express';
import { matchTracksToCadence } from '../services/matching.js';
import { lookupBpmForTracks } from '../services/bpmLookup.js';

const router = Router();

// Below this many exact matches, cascade to wider tolerances until we hit
// this count or run out of cascade steps.
const MIN_DESIRED_MATCHES = 8;
// ±5 → ±10 → ±15 → ±20 when the requested tolerance is 5, etc.
const CASCADE_MULTIPLIERS = [1, 2, 3, 4];

// body: { tracks: [{ id, title, artist, bpm }], cadence: number, tolerance: number }
router.post('/', async (req, res, next) => {
  try {
    const { tracks, cadence, tolerance } = req.body;

    // One line per request so BPM-coverage problems ("no matches") can be
    // diagnosed from the server log alone.
    console.log(
      `[match] request received: ${Array.isArray(tracks) ? tracks.length : typeof tracks} tracks, ` +
        `cadence=${cadence}, tolerance=${tolerance}`,
    );

    if (!Array.isArray(tracks)) return res.status(400).json({ error: '"tracks" must be an array' });
    if (typeof cadence !== 'number') return res.status(400).json({ error: '"cadence" must be a number' });
    if (typeof tolerance !== 'number') return res.status(400).json({ error: '"tolerance" must be a number' });

    // Spotify tracks arrive already enriched (GET /playlists/:id/tracks
    // does it there), but Apple Music tracks are fetched natively
    // on-device (modules/apple-music) and never pass through that route —
    // they'd otherwise arrive here with bpm always null and get filtered
    // out of every match. Enrich here too so matching works regardless of
    // source; lookupBpm's cache makes the already-enriched case cheap.
    const needsBpm = tracks.some((t) => typeof t.bpm !== 'number');
    const enrichedTracks = needsBpm ? await lookupBpmForTracks(tracks) : tracks;

    let matches = [];
    let usedTolerance = tolerance;

    for (const multiplier of CASCADE_MULTIPLIERS) {
      const candidateTolerance = tolerance * multiplier;
      const attempt = matchTracksToCadence(enrichedTracks, cadence, candidateTolerance);

      // Anything outside the *originally requested* tolerance is only a match
      // because we widened — tag it so the UI can show that distinction.
      matches = attempt.map((m) => ({ ...m, matchTier: m.distance > tolerance ? 'widened' : 'exact' }));
      usedTolerance = candidateTolerance;

      if (matches.length >= MIN_DESIRED_MATCHES) break;
    }

    console.log(
      `[match] result: ${matches.length} matches at tolerance ${usedTolerance} ` +
        `(sample bpm values: ${enrichedTracks.slice(0, 5).map((t) => t.bpm)})`,
    );
    res.json({ matches, tolerance: usedTolerance });
  } catch (err) {
    console.error('[match] error:', err);
    next(err);
  }
});

export default router;
