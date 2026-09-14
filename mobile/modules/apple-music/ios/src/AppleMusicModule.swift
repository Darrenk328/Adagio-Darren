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

    // Artwork bytes fetched via MusicDataRequest, keyed by the "musicKit://"
    // URL string itself — many tracks share one album's artwork, so this
    // avoids re-fetching identical bytes per track. See fetchArtworkDataURI.
    // An actor, not a plain dictionary: serializeAll fetches artwork for
    // every item concurrently via withTaskGroup, and a plain Dictionary
    // isn't safe to mutate from multiple concurrent tasks at once.
    private let artworkCache = ArtworkCache()

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
            return await self.serializeAll(Array(response.items), using: self.serialize)
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
            return await self.serializeAll(Array(tracks), using: self.serialize)
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
    private func serialize(_ playlist: Playlist) async -> [String: Any?] {
        [
            "id": playlist.id.rawValue,
            "name": playlist.name,
            "imageUrl": await fetchArtworkDataURI(playlist.artwork),
            // entries is only populated once .with(.tracks) has been
            // called on this specific instance — nil here for a plain
            // library-request result, matching fetchPlaylists' contract
            // (call fetchPlaylistTracks for the real count/contents).
            "trackCount": playlist.tracks?.count ?? 0,
        ]
    }

    @available(iOS 16.0, *)
    private func serialize(_ track: MusicKit.Track) async -> [String: Any?] {
        [
            "id": track.id.rawValue,
            "title": track.title,
            "artist": track.artistName,
            // MusicKit's Track doesn't carry a stable artist id the way
            // Spotify's API does without a further .artists relationship
            // load (only available on Song, not the Track enum) — left
            // nil rather than faked.
            "artistId": nil,
            "albumArtUrl": await fetchArtworkDataURI(track.artwork),
            "bpm": nil,
        ]
    }

    // Playlist.artwork.url(...) / Track.artwork.url(...) return
    // "musicKit://" scheme URLs for library items, not real HTTP(S) ones
    // — they only resolve through MusicKit's own rendering pipeline
    // (SwiftUI's ArtworkImage), not a plain URLSession/RN Image fetch.
    // Passing one through crashed React Native's image loader ("No
    // suitable image URL loader found for musicKit://..."), which is why
    // this returned nil for a while. The actual fix, per Apple's own
    // MusicKit docs: MusicDataRequest can fetch the real bytes behind
    // these URLs. Returned as a "data:" URI, which RN's Image component
    // renders natively with no custom loader needed.
    //
    // Cached by URL string — many tracks share one album's artwork, so
    // this avoids redundant fetches within a single playlist/session.
    @available(iOS 16.0, *)
    private func fetchArtworkDataURI(_ artwork: Artwork?, size: Int = 100) async -> String? {
        guard let url = artwork?.url(width: size, height: size) else { return nil }
        let key = url.absoluteString
        if let cached = await artworkCache.get(key) { return cached }

        do {
            let request = MusicDataRequest(urlRequest: URLRequest(url: url))
            let response = try await request.response()
            // MusicDataRequest doesn't report a MIME type — artwork.url(...)
            // has consistently returned JPEG data in testing, which is
            // what's assumed here.
            let uri = "data:image/jpeg;base64,\(response.data.base64EncodedString())"
            await artworkCache.set(key, uri)
            return uri
        } catch {
            await artworkCache.set(key, nil) // cache the failure too — don't retry every time
            return nil
        }
    }

    // Runs `transform` over every item concurrently, preserving input
    // order in the result — playlists/tracks can number in the dozens to
    // low hundreds, and fetching artwork sequentially (one MusicDataRequest
    // await at a time) would make a big playlist noticeably slow to load.
    @available(iOS 16.0, *)
    private func serializeAll<T>(
        _ items: [T],
        using transform: @escaping (T) async -> [String: Any?]
    ) async -> [[String: Any?]] {
        await withTaskGroup(of: (Int, [String: Any?]).self) { group in
            for (index, item) in items.enumerated() {
                group.addTask { (index, await transform(item)) }
            }
            var results = [[String: Any?]](repeating: [:], count: items.count)
            for await (index, value) in group {
                results[index] = value
            }
            return results
        }
    }
}

// Safe for concurrent access from serializeAll's withTaskGroup child tasks
// — a plain Dictionary isn't. `String?` values (not just `String`) so a
// failed lookup can be cached as a real "known failure" distinct from
// "never tried"; get()'s `String??` return reflects that same distinction.
actor ArtworkCache {
    private var storage: [String: String?] = [:]

    func get(_ key: String) -> String?? {
        storage[key]
    }

    func set(_ key: String, _ value: String?) {
        storage.updateValue(value, forKey: key)
    }
}

struct PlaylistNotFoundError: Error, CustomStringConvertible {
    let playlistId: String
    var description: String { "No library playlist found with id \(playlistId)" }
}

struct MusicKitUnavailableError: Error, CustomStringConvertible {
    var description: String { "MusicKit requires iOS 15.0 or later." }
}
