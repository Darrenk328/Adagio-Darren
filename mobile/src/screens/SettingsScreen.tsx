import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';
import { useSettings } from '../settings/SettingsContext';

const GETSONGBPM_URL = 'https://getsongbpm.com';

export default function SettingsScreen() {
  const { accessToken, logout } = useAuth();
  const { defaultTolerance, setDefaultTolerance } = useSettings();
  const [toleranceInput, setToleranceInput] = useState(String(defaultTolerance));

  const handleToleranceBlur = () => {
    const value = Number(toleranceInput);
    if (value > 0) {
      setDefaultTolerance(value);
    } else {
      setToleranceInput(String(defaultTolerance)); // reset to last valid value
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out of Spotify?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.header}>Settings</Text>

      <Text style={styles.sectionLabel}>Spotify account</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status</Text>
          <Text style={styles.rowValue}>{accessToken ? 'Connected' : 'Not connected'}</Text>
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

      <Pressable onPress={() => Linking.openURL(GETSONGBPM_URL)} style={styles.attribution}>
        <Text style={styles.attributionText}>
          Tempo data provided by <Text style={styles.attributionLink}>GetSongBPM.com</Text>
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24 },
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  rowLabel: { fontSize: 15, color: colors.text, fontWeight: '600' },
  rowValue: { fontSize: 15, color: colors.textMuted },
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
  attribution: { marginTop: 32, alignItems: 'center' },
  attributionText: { fontSize: 13, color: colors.textMuted },
  attributionLink: { color: colors.text, fontWeight: '600', textDecorationLine: 'underline' },
});
