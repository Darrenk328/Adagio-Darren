import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'CadenceInput'>;

const DEFAULT_TOLERANCE = 5;

export default function CadenceInputScreen({ route, navigation }: Props) {
  const { playlistId, playlistName } = route.params;
  const [cadence, setCadence] = useState('170');
  const [tolerance, setTolerance] = useState(String(DEFAULT_TOLERANCE));

  const handleSubmit = () => {
    const cadenceNum = Number(cadence);
    const toleranceNum = Number(tolerance);
    if (!cadenceNum || cadenceNum <= 0) return;

    navigation.navigate('Results', {
      playlistId,
      playlistName,
      cadence: cadenceNum,
      tolerance: toleranceNum || DEFAULT_TOLERANCE,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{playlistName}</Text>
      <Text style={styles.label}>Target cadence (steps per minute)</Text>
      <TextInput
        style={styles.input}
        value={cadence}
        onChangeText={setCadence}
        keyboardType="number-pad"
        placeholder="e.g. 170"
      />

      <Text style={styles.label}>Tolerance (+/- BPM)</Text>
      <TextInput
        style={styles.input}
        value={tolerance}
        onChangeText={setTolerance}
        keyboardType="number-pad"
        placeholder="e.g. 5"
      />

      <Pressable style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>Find matching songs</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24 },
  header: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 24 },
  label: { fontSize: 14, color: colors.textMuted, marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.secondary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
});
