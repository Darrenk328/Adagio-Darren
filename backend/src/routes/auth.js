import { Router } from 'express';
import { exchangeCodeForToken, refreshAccessToken } from '../services/spotify.js';

const router = Router();

// Mobile app sends the authorization code it got back from Spotify's login
// screen; we hold the client secret so the exchange happens server-side.
router.post('/token', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing "code" in request body' });

    const tokens = await exchangeCodeForToken(code);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Missing "refreshToken" in request body' });

    const tokens = await refreshAccessToken(refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

export default router;
