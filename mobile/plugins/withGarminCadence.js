const { withInfoPlist } = require('@expo/config-plugins');

// The Garmin ConnectIQ Mobile SDK's own custom URL scheme, distinct from
// Adagio's existing "adagio" scheme (used for the Spotify OAuth
// redirect) — must match garminCompanionURLScheme in
// modules/garmin-cadence/ios/src/GarminCadenceModule.swift.
const GARMIN_URL_SCHEME = 'adagio-garmin-ciq';

// Bundle id for Garmin Connect Mobile — required in
// LSApplicationQueriesSchemes so iOS lets this app query whether GCM is
// installed (canOpenURL) before attempting to launch it.
const GCM_QUERY_SCHEME = 'gcm-ciq';

const BLUETOOTH_USAGE_DESCRIPTION =
  'Used to receive live running cadence from a paired Garmin watch during a workout.';

/**
 * Adds the Info.plist entries the Garmin ConnectIQ Mobile SDK needs:
 * Bluetooth central-role usage description, permission to query Garmin
 * Connect Mobile's installed-app scheme, and our own return URL scheme
 * for its device-selection callback. Appends to any existing arrays
 * (LSApplicationQueriesSchemes, CFBundleURLTypes) rather than overwriting
 * them — Adagio's "adagio" scheme (from app.json's top-level `scheme`
 * field) already populates CFBundleURLTypes, and a plain static
 * `ios.infoPlist` override in app.json would have replaced that array
 * instead of extending it.
 *
 * Uses NSBluetoothAlwaysUsageDescription, NOT the legacy
 * NSBluetoothPeripheralUsageDescription — the latter is pre-iOS-13 and
 * doesn't cover apps acting as a Bluetooth *central* (scanning for/
 * connecting to another device, which is what this SDK does). Getting
 * this wrong was a real, hard-to-diagnose bug in the original standalone
 * prototype: iOS silently never showed the Bluetooth permission prompt
 * at all, with zero error surfaced anywhere.
 */
function withGarminCadence(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSBluetoothAlwaysUsageDescription = BLUETOOTH_USAGE_DESCRIPTION;

    const existingQueriesSchemes = config.modResults.LSApplicationQueriesSchemes ?? [];
    if (!existingQueriesSchemes.includes(GCM_QUERY_SCHEME)) {
      config.modResults.LSApplicationQueriesSchemes = [...existingQueriesSchemes, GCM_QUERY_SCHEME];
    }

    const existingUrlTypes = config.modResults.CFBundleURLTypes ?? [];
    const alreadyPresent = existingUrlTypes.some((entry) =>
      (entry.CFBundleURLSchemes ?? []).includes(GARMIN_URL_SCHEME),
    );
    if (!alreadyPresent) {
      config.modResults.CFBundleURLTypes = [
        ...existingUrlTypes,
        { CFBundleURLSchemes: [GARMIN_URL_SCHEME] },
      ];
    }

    return config;
  });
}

module.exports = withGarminCadence;
