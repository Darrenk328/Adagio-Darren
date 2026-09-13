import ExpoModulesCore
import MusicKit

// Port of AppleMusicAuthManager.swift (from the partner's standalone
// SwiftUI rewrite) into this app's actual Expo Modules API pattern —
// see modules/garmin-cadence for the sibling native module this mirrors.
//
// Unlike Spotify (src/api/client.ts), there's no OAuth token to hand to
// the backend: MusicKit holds authorization on-device, so this module
// does the library fetch itself and returns data already shaped like
// the app's existing Playlist/Track types (src/api/client.ts), so it can
// feed the same matching pipeline.
//
// KNOWN GAP: MusicKit's public API does not expose a track's tempo/BPM.
// `bpm` below is always nil — Apple Music tracks still need a BPM
// lookup the same way Spotify tracks do (GetSongBPM, or whatever the
// backend's /match endpoint ends up doing for tracks with no Spotify ID).
// Don't build UI that assumes Apple Music tracks arrive with real tempo
// data; that assumption was in the project's original notes but isn't
// something the framework actually provides.
//
// Every function below checks #available itself: MusicAuthorization needs
// iOS 15+, but MusicLibraryRequest (the actual playlist/track fetch)
// needs iOS 16+ — confirmed by xcodebuild, not assumed. Adagio's actual
// deployment target is 13.4 (ios/Adagio.xcodeproj), so none of this can
// be enforced at the pod/build level (see AppleMusic.podspec's comment)
// — a device below the required version must get a clean "unavailable"
// error, not a runtime trap on the first MusicKit symbol touched.
public class AppleMusicModule: Module {

    // Populated by fetchPlaylistTracks — play() looks tracks up here
    // instead of re-fetching by id via MusicLibraryRequest<Song>, which
    // turned out not to reliably resolve playlist-track ids at all (a
    // real, confirmed MusicKit quirk: it threw PlaylistNotFoundError on
    // every attempt during testing). MusicKit.Track conforms to
    // PlayableMusicItem directly, so the cached objects can go straight
    // into ApplicationMusicPlayer.Queue — no re-fetch needed at all.
    //
    // Stored as [String: Any] rather than [String: MusicKit.Track]: a
    // stored property's type is part of the class's memory layout, which
    // has to compile for every deployment target this app supports
    // (13.4) — unlike a function, `@available` on the property itself
    // isn't enough since MusicKit.Track needs iOS 16. Cast with
    // `as? MusicKit.Track` at each iOS-16-gated read/write site instead.
    private var trackCache: [String: Any] = [:]

    public func definition() -> ModuleDefinition {
        Name("AppleMusicModule")

        // Mirrors MusicAuthorization.Status as a string so the JS side
        // doesn't need to know about the native enum.
        Function("currentAuthorizationStatus") { () -> String in
            guard #available(iOS 15.0, *) else { return "unavailable" }
            return Self.statusString(MusicAuthorization.currentStatus)
        }

        // Shows the system prompt. Calling this again after a denial does
        // NOT re-prompt — iOS only asks once; the caller has to send the
        // user to Settings themselves. Mirrors AppleMusicAuthManager's
        // documented behavior.
        AsyncFunction("authorize") { () -> String in
            guard #available(iOS 15.0, *) else { return "unavailable" }
            let status = await MusicAuthorization.request()
            return Self.statusString(status)
        }

        // Returns up to `limit` library playlists, shaped like
        // src/api/client.ts's Playlist type.
        AsyncFunction("fetchPlaylists") { (limit: Int?) -> [[String: Any?]] in
            guard #available(iOS 16.0, *) else { throw MusicKitUnavailableError() }
            var request = MusicLibraryRequest<Playlist>()
            request.limit = limit ?? 50
            let response = try await request.response()
            return response.items.map(Self.serialize)
        }

        // Returns a playlist's tracks, shaped like src/api/client.ts's
        // Track type (bpm always nil — see the module-level note above).
        AsyncFunction("fetchPlaylistTracks") { (playlistId: String) -> [[String: Any?]] in
            guard #available(iOS 16.0, *) else { throw MusicKitUnavailableError() }
            var request = MusicLibraryRequest<Playlist>()
            request.filter(matching: \.id, memberOf: [MusicItemID(playlistId)])
            let response = try await request.response()

            guard let playlist = response.items.first else {
                throw PlaylistNotFoundError(playlistId: playlistId)
            }

            // A playlist from a library request arrives without its
            // tracks — the relationship has to be loaded explicitly.
            let detailed = try await playlist.with(.tracks)
            guard let tracks = detailed.tracks else { return [] }
            for track in tracks { self.trackCache[track.id.rawValue] = track }
            return tracks.map(Self.serialize)
        }

        // Playback: unlike Spotify Connect (a REST API controlling a
        // remote device — see startPlayback/pausePlayback in
        // src/api/client.ts, and "no active device" handling in
        // NowPlayingScreen), MusicKit plays natively on THIS device via
        // ApplicationMusicPlayer. There's no separate-device concept to
        // check for, so no "unavailable device" error path exists here.

        // Starts playback of the given track ids, in that order. Ids must
        // have come from a prior fetchPlaylistTracks call in this same
        // app session — that's what populates trackCache. (Re-fetching by
        // id via MusicLibraryRequest<Song> was the original approach here
        // and reliably failed with PlaylistNotFoundError on every real
        // test; playlist-track ids just don't resolve that way.)
        AsyncFunction("play") { (trackIds: [String]) -> Void in
            guard #available(iOS 16.0, *) else { throw MusicKitUnavailableError() }
            let tracks = trackIds.compactMap { self.trackCache[$0] as? MusicKit.Track }
            guard !tracks.isEmpty else { throw PlaylistNotFoundError(playlistId: trackIds.joined(separator: ",")) }

            ApplicationMusicPlayer.shared.queue = ApplicationMusicPlayer.Queue(for: tracks)
            try await ApplicationMusicPlayer.shared.play()
        }

        Function("pause") { () -> Void in
            guard #available(iOS 16.0, *) else { return }
            ApplicationMusicPlayer.shared.pause()
        }

        AsyncFunction("resume") { () -> Void in
            guard #available(iOS 16.0, *) else { throw MusicKitUnavailableError() }
            try await ApplicationMusicPlayer.shared.play()
        }

        AsyncFunction("skipToNext") { () -> Void in
            guard #available(iOS 16.0, *) else { throw MusicKitUnavailableError() }
            try await ApplicationMusicPlayer.shared.skipToNextEntry()
        }
    }

    @available(iOS 15.0, *)
    private static func statusString(_ status: MusicAuthorization.Status) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    @available(iOS 16.0, *)
    private static func serialize(_ playlist: Playlist) -> [String: Any?] {
        [
            "id": playlist.id.rawValue,
            "name": playlist.name,
            // Playlist.artwork.url(...) returns a "musicKit://" scheme
            // URL, not a real HTTP(S) one — it only resolves through
            // MusicKit's own rendering pipeline (SwiftUI's ArtworkImage),
            // not a plain URLSession/RN Image fetch. Passing it through
            // crashed React Native's image loader ("No suitable image
            // URL loader found for musicKit://..."). Left nil until
            // there's a native fetch (MusicDataRequest) to turn it into
            // real bytes — the UI already falls back to a placeholder box.
            "imageUrl": nil,
            // entries is only populated once .with(.tracks) has been
            // called on this specific instance — nil here for a plain
            // library-request result, matching fetchPlaylists' contract
            // (call fetchPlaylistTracks for the real count/contents).
            "trackCount": playlist.tracks?.count ?? 0,
        ]
    }

    @available(iOS 16.0, *)
    private static func serialize(_ track: MusicKit.Track) -> [String: Any?] {
        [
            "id": track.id.rawValue,
            "title": track.title,
            "artist": track.artistName,
            // MusicKit's Track doesn't carry a stable artist id the way
            // Spotify's API does without a further .artists relationship
            // load (only available on Song, not the Track enum) — left
            // nil rather than faked.
            "artistId": nil,
            // Same "musicKit://" scheme issue as Playlist.artwork above —
            // not a real HTTP(S) URL, left nil rather than crashing RN's
            // image loader.
            "albumArtUrl": nil,
            "bpm": nil,
        ]
    }
}

struct PlaylistNotFoundError: Error, CustomStringConvertible {
    let playlistId: String
    var description: String { "No library playlist found with id \(playlistId)" }
}

struct MusicKitUnavailableError: Error, CustomStringConvertible {
    var description: String { "MusicKit requires iOS 15.0 or later." }
}
