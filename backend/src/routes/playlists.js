import { Router } from 'express';
import { getUserPlaylists, getPlaylistTracks } from '../services/spotify.js';
import { lookupBpmForTracks, diagnosticCounts } from '../services/bpmLookup.js';

const router = Router();

function getAccessToken(req) {
  const header = req.headers.authorization; // "Bearer <token>"
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

router.get('/', async (req, res, next) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) return res.status(401).json({ error: 'Missing Spotify access token' });

    const playlists = await getUserPlaylists(accessToken);
    res.json(playlists);
  } catch (err) {
    next(err);
  }
});

// Returns the playlist's tracks enriched with a `bpm` field (null if unknown).
router.get('/:id/tracks', async (req, res, next) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) return res.status(401).json({ error: 'Missing Spotify access token' });

    const tracks = await getPlaylistTracks(accessToken, req.params.id);
    const withBpm = await lookupBpmForTracks(tracks);

    // TEMP DIAGNOSTIC — coverage vs. tolerance triage, see [conversation].
    const withData = withBpm.filter((t) => typeof t.bpm === 'number').length;
    console.log(
      `[bpm-coverage] ${withData}/${withBpm.length} got BPM. ` +
        `noMatch=${diagnosticCounts.noMatch} apiError=${diagnosticCounts.error} ` +
        `errorSamples=${JSON.stringify(diagnosticCounts.errorSamples)}`,
    );

    res.json(withBpm);
  } catch (err) {
    next(err);
  }
});

export default router;
