import axios from 'axios';

const GETSONGBPM_URL = 'https://api.getsong.co/search/';

// In-memory cache keyed by "artist|title" (lowercased). Good enough for an
// MVP single-instance server; swap for Redis/SQLite if this needs to survive
// restarts or run across multiple instances.
const cache = new Map();

// TEMP DIAGNOSTIC — coverage vs. tolerance triage, see [conversation].
export const diagnosticCounts = { noMatch: 0, error: 0, errorSamples: [] };

function cacheKey(artist, title) {
  return `${artist}|${title}`.toLowerCase();
}

/**
 * Look up a track's BPM (tempo) by artist + title via GetSongBPM.com.
 * Returns null if no match is found — callers should treat that track as
 * "unknown tempo" rather than fail the whole request.
 */
export async function lookupBpm(artist, title) {
  const key = cacheKey(artist, title);
  if (cache.has(key)) return cache.get(key);

  try {
    const { data } = await axios.get(GETSONGBPM_URL, {
      params: {
        api_key: process.env.GETSONGBPM_API_KEY,
        type: 'both',
        lookup: `song:${title} artist:${artist}`,
      },
    });

    const match = data?.search?.[0];
    const bpm = match?.tempo ? Number(match.tempo) : null;
    if (bpm === null) diagnosticCounts.noMatch++;

    cache.set(key, bpm);
    return bpm;
  } catch (err) {
    // GetSongBPM returns a 404-ish error payload (not a clean 404 status) when
    // there's no match — treat any failure here as "unknown" rather than
    // blowing up the whole playlist enrichment.
    diagnosticCounts.error++;
    if (diagnosticCounts.errorSamples.length < 3) {
      diagnosticCounts.errorSamples.push(`${err.response?.status ?? err.code ?? err.message}`);
    }
    cache.set(key, null);
    return null;
  }
}

/**
 * Look up BPM for a batch of tracks. Runs lookups with limited concurrency
 * to stay polite to the (free-tier) API.
 */
export async function lookupBpmForTracks(tracks, concurrency = 5) {
  const results = new Array(tracks.length);
  let next = 0;

  async function worker() {
    while (next < tracks.length) {
      const i = next++;
      const track = tracks[i];
      results[i] = { ...track, bpm: await lookupBpm(track.artist, track.title) };
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
