# Adagio Watch App (watchOS companion)

Source of truth for the **"Adagio Watch Connection Watch App"** Xcode target
— a minimal watchOS app that starts a real `HKWorkoutSession` on a paired
Apple Watch and mirrors it to the iPhone via
`startMirroringToCompanionDevice()`. The phone side that receives it is
`modules/healthkit-cadence/ios/src/HealthKitCadenceModule.swift`
(`startObservingMirroredSessions` / `adopt`), surfaced in the app as the
**Apple Watch** cadence source.

## Why this folder exists

`mobile/ios/` is gitignored (it's Expo's generated native project), and the
Xcode watch target lives inside it at
`ios/Adagio Watch Connection Watch App/`. That means the target itself —
and these Swift files, which Xcode keeps there — are **local-only** and
would be wiped by a fresh `expo prebuild` or missing on a clean checkout.
This folder is a tracked copy so the code can't be lost. **If you edit one,
edit the other** (or better: replace this with a real Expo config plugin,
e.g. the `@bacons/apple-targets` pattern, so `expo prebuild` regenerates
the target from tracked source — that's the proper long-term fix).

## Recreating the target on a fresh machine

Everything below was learned the hard way on a real Apple Watch SE 3;
each item was a separate real failure.

1. **File → New → Target → watchOS → Watch App.** Xcode's wizard, when run
   inside this Expo-generated project, produced a **"Watch-only App"**
   structure: a launch-prohibited *iOS* stub container (`watchapp2-container`
   product type, `ITSWatchOnlyContainer`) wrapping the real watchOS app,
   and it did **not** wire the phone target to embed anything. So:
2. On the **Adagio** (phone) target, add an **Embed Watch Content** copy-files
   phase (`dstSubfolderSpec = 16`, `dstPath = "$(CONTENTS_FOLDER_PATH)/Watch"`)
   that embeds **`Adagio Watch Connection Watch App.app`** — the inner
   watchOS app, *not* the iOS stub container (the installer rejects the stub:
   `MIInstallerErrorDomain error 92 / InvalidWatchKitApp`). Add a target
   dependency on that inner target too.
3. Watch app target build settings (it uses `GENERATE_INFOPLIST_FILE`):
   - `INFOPLIST_KEY_WKCompanionAppBundleIdentifier = com.darrenkapturski.Adagio`
   - `INFOPLIST_KEY_WKWatchOnly = NO` (YES means "no companion app exists")
   - `INFOPLIST_KEY_NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription`
   - `CODE_SIGN_ENTITLEMENTS` → `AdagioWatchApp.entitlements` (HealthKit)
   - Bundle ID must be prefixed by the phone app's; currently
     `com.darrenkapturski.Adagio.watchkitapp.watchkitapp`.
4. Add the watch app target to the **Adagio scheme's Build list** with
   Run checked, or it simply won't build as part of the phone build.
5. **Register the Watch's UDID** on developer.apple.com (Apple Configurator
   can read it via the paired iPhone — Xcode's Devices window won't show an
   unregistered Watch). Then delete the cached watch-app provisioning
   profile under `~/Library/Developer/Xcode/UserData/Provisioning Profiles`
   so automatic signing mints one that actually includes the Watch —
   otherwise the Watch app reports "cannot be installed at this time".
6. **Developer Mode on** on the Watch itself (Settings → Privacy & Security).
7. The Watch app's store-style install may still say "integrity could not
   be verified" for a dev-signed build. Install it **directly** instead:
   `xcrun devicectl device install app --device <watch-id> "<...>/Adagio.app/Watch/Adagio Watch Connection Watch App.app"`
   — that's the path Xcode's own Run uses and it establishes trust.

## Behavior

Tap **Start** on the Watch → session starts and mirrors to the phone.
Phone status flips to "Connected" and publishes live cadence (steps/min
derived from the workout's cumulative stepCount over a 10 s window,
EMA-smoothed — HealthKit has no running-cadence quantity type). Stop is
Watch-driven; the phone never ends a mirrored session itself.
