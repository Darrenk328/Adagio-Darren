import axios from 'axios';
import { BACKEND_URL } from '../config';

export const backend = axios.create({ baseURL: BACKEND_URL });

export type Playlist = {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  bpm: number | null;
};

export type MatchedTrack = Track & { effectiveBpm: number; distance: number };

export async function exchangeCodeForToken(code: string) {
  const { data } = await backend.post<{ access_token: string; refresh_token: string; expires_in: number }>(
    '/auth/token',
    { code },
  );
  return data;
}

export async function fetchPlaylists(accessToken: string) {
  const { data } = await backend.get<Playlist[]>('/playlists', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export async function fetchPlaylistTracks(accessToken: string, playlistId: string) {
  const { data } = await backend.get<Track[]>(`/playlists/${playlistId}/tracks`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export async function matchTracks(tracks: Track[], cadence: number, tolerance: number) {
  const { data } = await backend.post<MatchedTrack[]>('/match', { tracks, cadence, tolerance });
  return data;
}
