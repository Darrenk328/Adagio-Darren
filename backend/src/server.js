import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import playlistRoutes from './routes/playlists.js';
import matchRoutes from './routes/match.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/playlists', playlistRoutes);
app.use('/match', matchRoutes);

// Basic error handler so unexpected failures return JSON, not an HTML stack trace.
app.use((err, _req, res, _next) => {
  if (err.response) {
    // Axios error hitting Spotify/GetSongBPM — log the actual API response body,
    // not the giant request/socket object console.error(err) would otherwise dump.
    console.error(
      `Upstream ${err.response.status} from ${err.config?.url}:`,
      JSON.stringify(err.response.data),
      'www-authenticate:',
      err.response.headers?.['www-authenticate'],
    );
  } else {
    console.error(err);
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Adagio backend listening on http://localhost:${port}`);
});
