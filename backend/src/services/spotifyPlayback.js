import axios from 'axios';

const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Wraps a Spotify Connect playback call so "no active device" (the user
 * doesn't have Spotify open anywhere) comes back as a distinguishable error
 * rather than a generic 404/500, so the UI can show a clear message instead
 * of failing silently.
 */
async function withDeviceErrorHandling(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.response?.status === 404 && err.response?.data?.error?.reason === 'NO_ACTIVE_DEVICE') {
      const noDeviceError = new Error('No active Spotify device found');
      noDeviceError.status = 409;
      noDeviceError.code = 'NO_ACTIVE_DEVICE';
      throw noDeviceError;
    }
    throw err;
  }
}

/**
 * Current playback state (device, is_playing, current track). Spotify
 * returns 204 No Content with an empty body when nothing is active
 * anywhere — we surface that as `null`.
 */
export async function getPlaybackState(accessToken) {
  const { data, status } = await axios.get(`${SPOTIFY_API_URL}/me/player`, {
    headers: authHeaders(accessToken),
    validateStatus: (s) => s === 200 || s === 204,
  });
  if (status === 204 || !data) return null;

  return {
    isPlaying: data.is_playing,
    device: data.device ? { id: data.device.id, name: data.device.name } : null,
    progressMs: data.progress_ms ?? null,
    item: data.item ? { id: data.item.id, name: data.item.name } : null,
  };
}

/** Starts playback of a track queue (replacing whatever was playing) on the user's active device. */
export async function playTracks(accessToken, uris) {
  return withDeviceErrorHandling(() =>
    axios.put(`${SPOTIFY_API_URL}/me/player/play`, { uris }, { headers: authHeaders(accessToken) }),
  );
}

export async function pausePlayback(accessToken) {
  return withDeviceErrorHandling(() =>
    axios.put(`${SPOTIFY_API_URL}/me/player/pause`, {}, { headers: authHeaders(accessToken) }),
  );
}

/** Resumes whatever was paused, from where it left off — does not restart the track. */
export async function resumePlayback(accessToken) {
  return withDeviceErrorHandling(() =>
    axios.put(`${SPOTIFY_API_URL}/me/player/play`, {}, { headers: authHeaders(accessToken) }),
  );
}

export async function skipToNext(accessToken) {
  return withDeviceErrorHandling(() =>
    axios.post(`${SPOTIFY_API_URL}/me/player/next`, {}, { headers: authHeaders(accessToken) }),
  );
}
