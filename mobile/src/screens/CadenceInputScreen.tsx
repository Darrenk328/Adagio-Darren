import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { parsePaceString, estimateCadenceFromPace } from '../utils/paceToCadence';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'CadenceInput'>;

const DEFAULT_TOLERANCE = 5;
type Mode = 'cadence' | 'pace';

export default function CadenceInputScreen({ route, navigation }: Props) {
  const { playlistId, playlistName } = route.params;
  const [mode, setMode] = useState<Mode>('cadence');
  const [cadence, setCadence] = useState('170');
  const [tolerance, setTolerance] = useState(String(DEFAULT_TOLERANCE));
  const [paceInput, setPaceInput] = useState('');

  const paceSeconds = parsePaceString(paceInput);
  const isPaceInvalid = mode === 'pace' && paceInput.length > 0 && paceSeconds === null;

  const handlePaceChange = (text: string) => {
    setPaceInput(text);
    const seconds = parsePaceString(text);
    if (seconds !== null) {
      setCadence(String(estimateCadenceFromPace(seconds)));
    }
  };

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

      <View style={styles.modeSwitch}>
        <Pressable
          style={[styles.modeTab, mode === 'cadence' && styles.modeTabActive]}
          onPress={() => setMode('cadence')}
        >
          <Text style={[styles.modeTabText, mode === 'cadence' && styles.modeTabTextActive]}>By cadence</Text>
        </Pressable>
        <Pressable style={[styles.modeTab, mode === 'pace' && styles.modeTabActive]} onPress={() => setMode('pace')}>
          <Text style={[styles.modeTabText, mode === 'pace' && styles.modeTabTextActive]}>By pace</Text>
        </Pressable>
      </View>

      {mode === 'pace' && (
        <>
          <Text style={styles.label}>Pace (min:sec per mile)</Text>
          <TextInput
            style={[styles.input, isPaceInvalid && styles.inputError]}
            value={paceInput}
            onChangeText={handlePaceChange}
            keyboardType="numbers-and-punctuation"
            placeholder="e.g. 7:30"
          />
          {isPaceInvalid && <Text style={styles.errorText}>Enter pace as mm:ss, e.g. 7:30</Text>}
          {paceSeconds !== null && (
            <Text style={styles.hint}>
              Estimated cadence below — most runners stay in a similar cadence range across paces, so feel free to
              adjust it.
            </Text>
          )}
        </>
      )}

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
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  modeTab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  modeTabActive: { backgroundColor: colors.surface },
  modeTabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  modeTabTextActive: { color: colors.text },
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
  inputError: { borderColor: '#D64545' },
  errorText: { fontSize: 12, color: '#D64545', marginTop: 6 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
  button: {
    backgroundColor: colors.secondary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
});
