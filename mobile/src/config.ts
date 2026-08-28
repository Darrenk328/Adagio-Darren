// Point this at your backend. When testing on a physical device with Expo
// Go, "localhost" refers to the phone itself — use your computer's LAN IP
// instead (e.g. http://192.168.1.23:3000).
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:3000';

export const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '';
export const SPOTIFY_REDIRECT_URI = 'adagio://callback';
export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-email',
  // Needed for the Now Playing screen's playback controls (Spotify Connect
  // Web API — controls whatever device the user already has Spotify active
  // on, no in-app audio SDK).
  'user-modify-playback-state',
  'user-read-playback-state',
];
