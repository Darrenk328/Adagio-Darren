# Adagio

Matches songs in your Spotify playlists to your running cadence (steps per
minute), based on tempo (BPM).

**MVP scope:** Spotify login → pick a playlist → enter a target cadence →
get back a filtered/sorted list of tracks whose tempo matches.

## Stack

- `mobile/` — React Native (Expo), TypeScript
- `backend/` — Node.js + Express (handles the Spotify OAuth code exchange and
  BPM lookups/caching, since the client secret and third-party API key can't
  live on the phone)

Spotify deprecated its `audio-features` endpoint (BPM data) in Nov 2024, so
BPM lookups go through [GetSongBPM.com](https://getsongbpm.com/api) instead,
matched by artist + track title.

## Setup

### 1. Spotify Developer app

Create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):

- Redirect URI: `adagio://callback`
- APIs used: Web API

Grab the **Client ID** and **Client Secret** from the app's Settings page.

### 2. GetSongBPM API key

Sign up at [getsongbpm.com/api](https://getsongbpm.com/api) for a free API key.

### 3. Backend

```bash
cd backend
cp .env.example .env   # fill in SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, GETSONGBPM_API_KEY
npm install
npm run dev             # starts on http://localhost:3000
```

### 4. Mobile app

```bash
cd mobile
cp .env.example .env   # set EXPO_PUBLIC_SPOTIFY_CLIENT_ID (same Client ID as backend)
                         # and EXPO_PUBLIC_BACKEND_URL (your machine's LAN IP if testing
                         # on a physical device via Expo Go, since "localhost" would
                         # otherwise mean the phone itself)
npm install
npm start
```

Scan the QR code with Expo Go (iOS/Android) to run it.

## Project structure

```
Adagio/
  backend/
    src/
      routes/       auth, playlists, match — HTTP layer
      services/      spotify.js (Spotify API calls), bpmLookup.js (GetSongBPM + cache),
                      matching.js (pure cadence-matching function)
      server.js
  mobile/
    src/
      screens/       Login, PlaylistPicker, CadenceInput, Results
      navigation/     stack navigator, swaps to the logged-in flow once authed
      auth/           AuthContext — holds the Spotify access token (SecureStore-backed)
      api/            typed client for the backend
      theme/          colors.ts — white background, yellow/lime accents
```

## Not in scope yet (future phases)

- Refresh-token handling on the client (backend route exists: `POST /auth/refresh`)
- Persistent BPM cache (currently in-memory, resets on backend restart)
- Pagination beyond a playlist's first 100 tracks fetch loop (already handled)
  or a user's first 50 playlists (not yet paginated)
- Any kind of run-tracking/GPS features — this MVP is just the matching tool
