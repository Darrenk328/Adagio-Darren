import axios from 'axios';

const GETSONGBPM_URL = 'https://api.getsong.co/search/';
const THEAUDIODB_URL = 'https://www.theaudiodb.com/api/v1/json/2/searchtrack.php';
// TheAudioDB's public test key ("2") — heavily rate-limited and meant for
// exactly this kind of evaluation. Swap for a real key (theaudiodb.com's
// Patreon-gated tier) if this starts throttling in real use.
const RECCOBEATS_URL = 'https://api.reccobeats.com/v1/track';

// In-memory cache keyed by "artist|title" (lowercased). Good enough for an
// MVP single-instance server; swap for Redis/SQLite if this needs to survive
// restarts or run across multiple instances.
const cache = new Map();

// TEMP DIAGNOSTIC — coverage vs. tolerance triage, see [conversation].
export const diagnosticCounts = { noMatch: 0, error: 0, errorSamples: [] };

function cacheKey(artist, title) {
  return `${artist}|${title}`.toLowerCase();
}

// Apple Music library metadata (and some Spotify credits) carry noise these
// text-search APIs choke on: "(feat. X)"/"(with X)" annotations, "(From
// "Movie Title")" soundtrack tags, "(X Remix)" suffixes, and
// compilation-style artist credits like "Lena Raine & Minecraft" (not a
// real artist — an Apple Music library quirk for game OST tracks).
// Stripping this noise is a real, verified fix; it does NOT address
// genuinely uncovered genres (anime OSTs, ambient game soundtracks,
// underground rap) — none of these sources have that content regardless
// of query cleanliness.
function cleanTitle(title) {
  return title
    .replace(/\s*\((?:feat\.?|with|from)\b[^)]*\)/gi, '')
    .replace(/\s*\((?:[^)]*\bremix\b[^)]*)\)/gi, '')
    .trim();
}

function cleanArtist(artist) {
  // Keep only the first credited artist — "Lena Raine & Minecraft",
  // "YOSHIKI feat. HYDE", "Metro Boomin & James Blake" all fail search
  // as a single string but the primary artist alone often succeeds.
  return artist.split(/\s*(?:&|,|feat\.?|featuring)\s*/i)[0].trim();
}

// Spotify track ids are 22-char base62 strings. Apple Music's MusicKit ids
// (and GetSongBPM/TheAudioDB's own internal ids) don't look like this, so
// this is a reliable-enough heuristic for "is this actually usable as a
// Spotify id" without needing a real `source` field on Track (there isn't
// one — see src/api/client.ts).
function looksLikeSpotifyId(id) {
  return typeof id === 'string' && /^[0-9A-Za-z]{22}$/.test(id);
}

// One raw request to GetSongBPM. Returns { bpm, data } so callers can log
// the raw response on a miss without a second network round-trip.
async function querySongBpm(artist, title) {
  const { data } = await axios.get(GETSONGBPM_URL, {
    params: {
      api_key: process.env.GETSONGBPM_API_KEY,
      type: 'both',
      lookup: `song:${title} artist:${artist}`,
    },
  });
  const match = data?.search?.[0];
  const bpm = match?.tempo ? Number(match.tempo) : null;
  return { bpm, data };
}

// One raw request to TheAudioDB. Verified live (curl) before writing this:
// the tempo field is `intTempo`, a numeric string, on searchtrack.php's
// first result.
async function queryTheAudioDb(artist, title) {
  const { data } = await axios.get(THEAUDIODB_URL, {
    params: { s: artist, t: title },
  });
  const match = data?.track?.[0];
  const bpm = match?.intTempo ? Number(match.intTempo) : null;
  return { bpm, data };
}

// ReccoBeats (an unofficial, community-run mimic of Spotify's discontinued
// audio-features API) doesn't do reliable text search — verified live: a
// combined "title artist" search query returned a wrong-artist match. It
// only works well by Spotify track id: one call resolves the id to
// ReccoBeats' own internal id, a second fetches audio features from that.
// So this is Spotify-track-only — no help for Apple Music tracks, which
// don't have a Spotify id at all.
async function queryReccoBeats(spotifyId) {
  const { data: searchData } = await axios.get(RECCOBEATS_URL, { params: { ids: spotifyId } });
  const recTrack = searchData?.content?.[0];
  if (!recTrack?.id) return { bpm: null, data: searchData };

  const { data: featuresData } = await axios.get(`${RECCOBEATS_URL}/${recTrack.id}/audio-features`);
  const bpm = featuresData?.tempo ? Number(featuresData.tempo) : null;
  return { bpm, data: featuresData };
}

/**
 * Look up a track's BPM (tempo), cascading across sources: GetSongBPM,
 * then TheAudioDB (both by artist+title text search, each retried once
 * with noise-stripped title/artist), then ReccoBeats (only when `id`
 * looks like a real Spotify track id — see looksLikeSpotifyId). Returns
 * null if nothing finds a match — callers should treat that track as
 * "unknown tempo" rather than fail the whole request.
 */
export async function lookupBpm(artist, title, id) {
  const key = cacheKey(artist, title);
  if (cache.has(key)) return cache.get(key);

  const cleanedTitle = cleanTitle(title);
  const cleanedArtist = cleanArtist(artist);
  const isCleaned = cleanedTitle !== title || cleanedArtist !== artist;

  const attempts = [
    () => querySongBpm(artist, title),
    isCleaned ? () => querySongBpm(cleanedArtist, cleanedTitle) : null,
    () => queryTheAudioDb(artist, title),
    isCleaned ? () => queryTheAudioDb(cleanedArtist, cleanedTitle) : null,
    looksLikeSpotifyId(id) ? () => queryReccoBeats(id) : null,
  ].filter(Boolean);

  let bpm = null;
  let lastData = null;

  for (const attempt of attempts) {
    try {
      ({ bpm, data: lastData } = await attempt());
      if (bpm !== null) break;
    } catch (err) {
      // A source erroring (rate limit, no-result-as-error-payload, etc.)
      // just means "try the next one" — same treat-as-unknown philosophy
      // as the final catch below, just scoped per-source.
      diagnosticCounts.error++;
      if (diagnosticCounts.errorSamples.length < 3) {
        diagnosticCounts.errorSamples.push(`${err.response?.status ?? err.code ?? err.message}`);
      }
    }
  }

  if (bpm === null) {
    diagnosticCounts.noMatch++;
    // TEMP DIAGNOSTIC — seeing real title/artist strings side by side
    // with the last source's raw response, to keep triaging coverage.
    console.log(
      `[bpm] no match for "${title}" / "${artist}" across all sources ` +
        `(tried cleaned: "${cleanedTitle}" / "${cleanedArtist}") — last raw response: ` +
        `${JSON.stringify(lastData).slice(0, 200)}`,
    );
  }

  cache.set(key, bpm);
  return bpm;
}

/**
 * Look up BPM for a batch of tracks. Runs lookups with limited concurrency
 * to stay polite to the (free-tier) APIs.
 */
export async function lookupBpmForTracks(tracks, concurrency = 5) {
  const results = new Array(tracks.length);
  let next = 0;

  async function worker() {
    while (next < tracks.length) {
      const i = next++;
      const track = tracks[i];
      results[i] = { ...track, bpm: await lookupBpm(track.artist, track.title, track.id) };
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
