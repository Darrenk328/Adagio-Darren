import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Linking, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';
import { useSettings } from '../settings/SettingsContext';
import { useLiveCadence } from '../cadence/LiveCadenceContext';

const GETSONGBPM_URL = 'https://getsongbpm.com';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Not connected',
  needsGCM: "Garmin Connect Mobile isn't installed",
  opening: 'Opening Garmin Connect…',
  found: 'Found device — waiting for connection…',
  connected: 'Connecting…',
  ready: 'Connected',
  notConnected: 'Not connected',
  bluetoothNotReady: 'Bluetooth not ready',
  notFound: 'Device not found',
  invalidDevice: 'Invalid device',
  noDeviceReturned: "Couldn't find a device — try again",
  unknown: 'Unknown status',
  // healthkit-cadence statuses (its 'tracking' arrives here already
  // normalized to 'ready' by LiveCadenceContext, so it reuses that label)
  stopped: 'Not tracking',
  error: 'Something went wrong',
  unavailable: 'Requires iOS 26 or later',
};

export default function SettingsScreen() {
  const { musicSource, logout } = useAuth();
  const serviceName = musicSource === 'appleMusic' ? 'Apple Music' : 'Spotify';
  const { defaultTolerance, setDefaultTolerance, cadenceSource, setCadenceSource } = useSettings();
  const {
    connectionStatus,
    deviceName,
    currentCadence,
    findDevice,
    requestHealthAccess,
    watchStatus,
    reconnectWatch,
    garminStatus,
  } = useLiveCadence();
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleReconnectWatch = async () => {
    setIsReconnecting(true);
    try {
      await reconnectWatch();
    } catch (err) {
      Alert.alert('Couldn’t reach Apple Watch', err instanceof Error ? err.message : String(err));
    } finally {
      setIsReconnecting(false);
    }
  };

  // For Apple Watch, "connected" only exists while a workout is mirroring;
  // between workouts the useful question is whether a Watch with Adagio is
  // there at all — so that's what the status line answers.
  const watchStatusLabel =
    connectionStatus === 'ready'
      ? 'Tracking'
      : watchStatus == null
        ? 'Checking…'
        : !watchStatus.supported || !watchStatus.paired
          ? 'No Watch paired'
          : !watchStatus.appInstalled
            ? 'Adagio not on Watch'
            : 'Ready';
  const watchStatusIsGood = connectionStatus === 'ready' || (watchStatus?.paired && watchStatus?.appInstalled);
  const [toleranceInput, setToleranceInput] = useState(String(defaultTolerance));

  const handleToleranceBlur = () => {
    const value = Number(toleranceInput);
    if (value > 0) {
      setDefaultTolerance(value);
    } else {
      setToleranceInput(String(defaultTolerance)); // reset to last valid value
    }
  };

  const handleRequestHealthAccess = async () => {
    try {
      await requestHealthAccess();
      // HealthKit only shows its system prompt once ever per app — if
      // access was already granted or denied earlier (e.g. from testing
      // the other HealthKit-based source), this resolves instantly with
      // no dialog at all. Without this, that looked indistinguishable
      // from "the button doesn't work" — real bug report from testing.
      Alert.alert(
        'HealthKit access requested',
        'If this is the first time, you should have seen a system permission prompt. If not, a decision was already made previously — check Settings app › Privacy & Security › Health › Adagio to confirm.',
      );
    } catch (err) {
      // HealthKit never reveals whether READ access was actually granted
      // (a denied read type just silently returns no data later) — this
      // failing means the prompt itself couldn't be shown (e.g. HealthKit
      // unavailable on this device), which is worth surfacing directly.
      Alert.alert('Could not request HealthKit access', err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogout = () => {
    Alert.alert(`Log out of ${serviceName}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.header}>Settings</Text>

      <Text style={styles.sectionLabel}>{serviceName} account</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status</Text>
          <Text style={styles.rowValue}>{musicSource ? 'Connected' : 'Not connected'}</Text>
        </View>
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log out</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Matching</Text>
      <View style={styles.card}>
        <Text style={styles.rowLabel}>Default tolerance (+/-)</Text>
        <TextInput
          style={styles.input}
          value={toleranceInput}
          onChangeText={setToleranceInput}
          onBlur={handleToleranceBlur}
          keyboardType="number-pad"
        />
        <Text style={styles.hint}>Used to pre-fill the tolerance field when setting up a workout.</Text>
      </View>

      <Text style={styles.sectionLabel}>Cadence source</Text>
      <View style={styles.card}>
        <View style={styles.cadenceToggle}>
          <Pressable
            style={[styles.cadenceOption, cadenceSource === 'none' && styles.cadenceOptionActive]}
            onPress={() => setCadenceSource('none')}
          >
            <Text style={[styles.cadenceOptionText, cadenceSource === 'none' && styles.cadenceOptionTextActive]}>
              None
            </Text>
          </Pressable>
          <Pressable
            style={[styles.cadenceOption, cadenceSource === 'garmin' && styles.cadenceOptionActive]}
            onPress={() => setCadenceSource('garmin')}
          >
            <Text style={[styles.cadenceOptionText, cadenceSource === 'garmin' && styles.cadenceOptionTextActive]}>
              Garmin Watch
            </Text>
          </Pressable>
          <Pressable
            style={[styles.cadenceOption, cadenceSource === 'healthkit' && styles.cadenceOptionActive]}
            onPress={() => setCadenceSource('healthkit')}
          >
            <Text
              style={[styles.cadenceOptionText, cadenceSource === 'healthkit' && styles.cadenceOptionTextActive]}
            >
              iPhone (HealthKit)
            </Text>
          </Pressable>
          <Pressable
            style={[styles.cadenceOption, cadenceSource === 'appleWatch' && styles.cadenceOptionActive]}
            onPress={() => setCadenceSource('appleWatch')}
          >
            <Text
              style={[styles.cadenceOptionText, cadenceSource === 'appleWatch' && styles.cadenceOptionTextActive]}
            >
              Apple Watch
            </Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {cadenceSource === 'healthkit'
            ? // Deliberately not calling this "Apple Watch" — it's cadence estimated
              // from the iPhone's own sensors via HealthKit, not real Watch telemetry.
              'Estimates your cadence from the iPhone’s own motion sensors during a workout. Requires iOS 26+ and a granted HealthKit permission below.'
            : cadenceSource === 'appleWatch'
              ? 'Reads real live cadence from a paired Apple Watch. Starting a workout here launches Adagio on your Watch automatically; you can also start it from the Watch itself.'
              : 'When set to Garmin Watch, live cadence from a paired watch drives in-workout voice nudges when your pace drifts from the target.'}
        </Text>

        {cadenceSource === 'garmin' && (
          <View style={styles.garminStatus}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{deviceName ?? garminStatus?.deviceName ?? 'Status'}</Text>
              <View style={styles.statusWithAction}>
                <Text style={[styles.rowValue, connectionStatus !== 'ready' && styles.rowValueWarn]}>
                  {STATUS_LABEL[connectionStatus] ?? connectionStatus}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.reconnectButton, pressed && { opacity: 0.6 }]}
                  onPress={findDevice}
                  accessibilityLabel="Reconnect Garmin watch"
                >
                  <Ionicons name="refresh" size={18} color={colors.text} />
                </Pressable>
              </View>
            </View>
            {garminStatus?.installed === false && (
              <Text style={styles.hint}>
                The Adagio app isn’t on this watch. Install it from the Connect IQ store, then reconnect.
              </Text>
            )}
            {currentCadence != null && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Live cadence</Text>
                <Text style={styles.rowValue}>{currentCadence} spm</Text>
              </View>
            )}
            <Pressable style={styles.logoutButton} onPress={findDevice}>
              <Text style={styles.logoutButtonText}>
                {garminStatus?.hasDevice ? 'Choose a different watch' : 'Find Device'}
              </Text>
            </Pressable>
            <Text style={styles.hint}>
              Your watch is remembered between launches. Starting a workout asks it to open Adagio — tap “Yes” on
              the watch and it begins recording.
            </Text>
          </View>
        )}

        {cadenceSource === 'healthkit' && (
          <View style={styles.garminStatus}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Status</Text>
              <Text style={styles.rowValue}>{STATUS_LABEL[connectionStatus] ?? connectionStatus}</Text>
            </View>
            {currentCadence != null && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Live cadence</Text>
                <Text style={styles.rowValue}>{currentCadence} spm</Text>
              </View>
            )}
            <Pressable style={styles.logoutButton} onPress={handleRequestHealthAccess}>
              <Text style={styles.logoutButtonText}>Request HealthKit Access</Text>
            </Pressable>
            <Text style={styles.hint}>
              Tracking itself starts automatically when a workout begins — this button just grants the
              permission ahead of time.
            </Text>
          </View>
        )}

        {cadenceSource === 'appleWatch' && (
          <View style={styles.garminStatus}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Status</Text>
              <View style={styles.statusWithAction}>
                <Text style={[styles.rowValue, !watchStatusIsGood && styles.rowValueWarn]}>{watchStatusLabel}</Text>
                <Pressable
                  style={({ pressed }) => [styles.reconnectButton, pressed && { opacity: 0.6 }]}
                  onPress={handleReconnectWatch}
                  disabled={isReconnecting}
                  accessibilityLabel="Reconnect Apple Watch"
                >
                  {isReconnecting ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Ionicons name="refresh" size={18} color={colors.text} />
                  )}
                </Pressable>
              </View>
            </View>
            {watchStatus && watchStatus.paired && !watchStatus.appInstalled && (
              <Text style={styles.hint}>
                Install Adagio on your Watch: open the Watch app on this iPhone, scroll to Available Apps, and tap
                Install next to Adagio.
              </Text>
            )}
            {currentCadence != null && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Live cadence</Text>
                <Text style={styles.rowValue}>{currentCadence} spm</Text>
              </View>
            )}
            <Pressable style={styles.logoutButton} onPress={handleRequestHealthAccess}>
              <Text style={styles.logoutButtonText}>Request HealthKit Access</Text>
            </Pressable>
            <Text style={styles.hint}>
              Grant this once, ahead of time. Tap ↻ if a workout can’t find your Watch — it re-checks the
              Watch and starts listening again.
            </Text>
          </View>
        )}
      </View>

      <Pressable onPress={() => Linking.openURL(GETSONGBPM_URL)} style={styles.attribution}>
        <Text style={styles.attributionText}>
          Tempo data provided by <Text style={styles.attributionLink}>GetSongBPM.com</Text>
        </Text>
      </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 24, paddingBottom: 48 },
  header: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 24 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  // rowLabel keeps its natural width (device names are short); rowValue
  // takes the rest and wraps instead of overflowing off-screen — status
  // strings like "Found device — waiting for connection…" are longer
  // than this row was originally designed for.
  rowLabel: { fontSize: 15, color: colors.text, fontWeight: '600', flexShrink: 0, marginRight: 12 },
  rowValue: { fontSize: 15, color: colors.textMuted, flex: 1, textAlign: 'right' },
  rowValueWarn: { color: '#D64545' },
  statusWithAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  reconnectButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    backgroundColor: colors.border,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoutButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  // flexWrap, not a single flex:1 row: four options ("iPhone (HealthKit)",
  // "Apple Watch", etc.) don't fit legibly across one row on a normal
  // phone width — wraps into a 2x2 grid instead of squeezing/clipping text.
  cadenceToggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.border,
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
  },
  cadenceOption: { flexGrow: 1, flexBasis: '46%', paddingVertical: 8, borderRadius: 6, alignItems: 'center', margin: 2 },
  cadenceOptionActive: { backgroundColor: colors.surface },
  cadenceOptionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  cadenceOptionTextActive: { color: colors.text },
  garminStatus: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  attribution: { marginTop: 32, alignItems: 'center' },
  attributionText: { fontSize: 13, color: colors.textMuted },
  attributionLink: { color: colors.text, fontWeight: '600', textDecorationLine: 'underline' },
});
