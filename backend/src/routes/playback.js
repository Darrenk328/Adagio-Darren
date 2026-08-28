import { Router } from 'express';
import { getPlaybackState, playTracks, pausePlayback, resumePlayback, skipToNext } from '../services/spotifyPlayback.js';

const router = Router();

function getAccessToken(req) {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAccessToken(req, res) {
  const accessToken = getAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Missing Spotify access token' });
    return null;
  }
  return accessToken;
}

// Wraps a route handler so a NO_ACTIVE_DEVICE error (thrown by the playback
// service) comes back as { error: 'NO_ACTIVE_DEVICE', message } with a 409,
// instead of falling through to the generic 500 handler.
function handlePlaybackErrors(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.code === 'NO_ACTIVE_DEVICE') {
        return res.status(409).json({ error: err.code, message: err.message });
      }
      next(err);
    }
  };
}

router.get(
  '/state',
  handlePlaybackErrors(async (req, res) => {
    const accessToken = requireAccessToken(req, res);
    if (!accessToken) return;
    res.json(await getPlaybackState(accessToken));
  }),
);

// body: { trackIds: string[] } — plain Spotify track IDs, converted to URIs here.
router.post(
  '/play',
  handlePlaybackErrors(async (req, res) => {
    const accessToken = requireAccessToken(req, res);
    if (!accessToken) return;

    const { trackIds } = req.body;
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ error: '"trackIds" must be a non-empty array' });
    }

    await playTracks(
      accessToken,
      trackIds.map((id) => `spotify:track:${id}`),
    );
    res.json({ ok: true });
  }),
);

router.post(
  '/pause',
  handlePlaybackErrors(async (req, res) => {
    const accessToken = requireAccessToken(req, res);
    if (!accessToken) return;
    await pausePlayback(accessToken);
    res.json({ ok: true });
  }),
);

router.post(
  '/resume',
  handlePlaybackErrors(async (req, res) => {
    const accessToken = requireAccessToken(req, res);
    if (!accessToken) return;
    await resumePlayback(accessToken);
    res.json({ ok: true });
  }),
);

router.post(
  '/next',
  handlePlaybackErrors(async (req, res) => {
    const accessToken = requireAccessToken(req, res);
    if (!accessToken) return;
    await skipToNext(accessToken);
    res.json({ ok: true });
  }),
);

export default router;
