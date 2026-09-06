# Adagio Garmin Watch App

Connect IQ watch app (Monkey C) that reads live running cadence and
transmits it to the Adagio iOS app over Bluetooth, for the optional
"Garmin Watch" cadence source (see Settings in the main app).

Deliberately a separate top-level folder from `mobile/` and `backend/` —
different language and toolchain (Monkey C, Connect IQ SDK), not part of
either the React Native or Node build.

Ported from (and supersedes, for Adagio's purposes) the standalone
[garmin-cadence-prototype](https://github.com/Darrenk328/garmin-cadence-prototype)
repo, which remains as the original proof-of-concept and reference for
how each real-hardware bug was diagnosed. This folder has its own
identity: a fresh app id and a fresh signing key, distinct from the
prototype's — not an "update" of it.

## Building

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
SDK="$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks/<installed-version>"
monkeyc -f monkey.jungle -d fr55 -o bin/Adagio.prg -y keys/developer_key.der -w
```

Sideload onto a real Forerunner 55: connect via USB clip cable, copy
`bin/Adagio.prg` into `GARMIN/APPS/` on the mounted drive, eject.

## Coordinating with the iOS side

The app id in `manifest.xml` must match the `IQApp` UUID the iOS native
module (`mobile/modules/garmin-cadence/`) constructs — same 128 bits,
just reformatted as a dashed `NSUUID` string. If this app is ever
re-signed with a new id, update both sides together.

## Differences from the original prototype

- Fresh app id + fresh developer signing key (not reused from the
  prototype, deliberately — see project memory for why)
- Entry point/class names renamed to `AdagioApp`/`AdagioCadenceView`/
  `AdagioTransmitListener`, app display name "Adagio"
- `Communications.transmit()` is now throttled — at most once every 3
  seconds, and skipped entirely if cadence hasn't changed since the last
  send. The prototype sent every single second unconditionally, which
  was fine for a 60-second test but unnecessary BLE traffic and battery
  draw over a real hour-long workout. The on-screen number still
  refreshes every second regardless — only the phone transmission is
  throttled.
- `mSession.start()`'s return value is now checked (logged if it fails)
  instead of silently ignored.
