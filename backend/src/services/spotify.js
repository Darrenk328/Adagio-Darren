import axios from 'axios';

const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

function basicAuthHeader() {
  const creds = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(creds).toString('base64')}`;
}

/**
 * Exchange an OAuth authorization code (from the mobile app's login flow)
 * for an access token + refresh token.
 */
export async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
  });

  const { data } = await axios.post(SPOTIFY_ACCOUNTS_URL, body, {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return data; // { access_token, refresh_token, expires_in, ... }
}

/**
 * Use a refresh token to get a new access token once the old one expires.
 */
export async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const { data } = await axios.post(SPOTIFY_ACCOUNTS_URL, body, {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return data; // { access_token, expires_in, ... } (refresh_token sometimes omitted)
}

/**
 * Fetch the current user's playlists (first page, up to 50).
 */
export async function getUserPlaylists(accessToken) {
  const { data } = await axios.get(`${SPOTIFY_API_URL}/me/playlists`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { limit: 50 },
  });

  return data.items.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.images?.[0]?.url ?? null,
    // Feb 2026 Dev Mode migration renamed the playlist object's `tracks` field
    // to `items` (same rename as the /tracks -> /items endpoint change) — fall
    // back to the old field name in case an older-shaped response comes through.
    trackCount: p.items?.total ?? p.tracks?.total ?? 0,
  }));
}

/**
 * Fetch all tracks in a playlist (paginated, Spotify caps each page at 100).
 */
export async function getPlaylistTracks(accessToken, playlistId) {
  const tracks = [];
  // As of Spotify's Feb 2026 Dev Mode migration, /tracks was renamed to /items
  // (and each entry's `track` field to `item`) for Development Mode apps.
  let url = `${SPOTIFY_API_URL}/playlists/${playlistId}/items`;
  let params = { limit: 100 };

  while (url) {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });

    for (const entry of data.items) {
      const track = entry.item ?? entry.track; // fall back to old shape just in case
      if (!track) continue; // local/unavailable tracks show up as null
      tracks.push({
        id: track.id,
        title: track.name,
        artist: track.artists?.[0]?.name ?? 'Unknown',
        artistId: track.artists?.[0]?.id ?? null,
        albumArtUrl: track.album?.images?.[0]?.url ?? null,
      });
    }

    url = data.next; // full next-page URL, or null when done
    params = undefined; // params are already baked into `next`
  }

  return tracks;
}
