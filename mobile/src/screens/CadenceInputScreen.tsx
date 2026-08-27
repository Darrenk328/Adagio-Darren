import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { parsePaceString, estimateCadenceFromPace } from '../utils/paceToCadence';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'CadenceInput'>;

const DEFAULT_TOLERANCE = 5;
type InputMode = 'cadence' | 'pace';
type Activity = 'running' | 'cycling';

const UNIT: Record<Activity, string> = { running: 'SPM', cycling: 'RPM' };
const DEFAULT_CADENCE: Record<Activity, string> = { running: '170', cycling: '90' };

export default function CadenceInputScreen({ route, navigation }: Props) {
  const { playlistId, playlistName } = route.params;
  const [activity, setActivity] = useState<Activity>('running');
  const [inputMode, setInputMode] = useState<InputMode>('cadence');
  const [cadence, setCadence] = useState('170');
  const [tolerance, setTolerance] = useState(String(DEFAULT_TOLERANCE));
  const [paceInput, setPaceInput] = useState('');

  const unit = UNIT[activity];
  const paceSeconds = parsePaceString(paceInput);
  const isPaceInvalid = activity === 'running' && inputMode === 'pace' && paceInput.length > 0 && paceSeconds === null;

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
      unit,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{playlistName}</Text>

      <View style={styles.modeSwitch}>
        <Pressable
          style={[styles.modeTab, activity === 'running' && styles.modeTabActive]}
          onPress={() => {
            setActivity('running');
            setCadence(DEFAULT_CADENCE.running);
          }}
        >
          <Text style={[styles.modeTabText, activity === 'running' && styles.modeTabTextActive]}>Running</Text>
        </Pressable>
        <Pressable
          style={[styles.modeTab, activity === 'cycling' && styles.modeTabActive]}
          onPress={() => {
            setActivity('cycling');
            setInputMode('cadence'); // pace-based input is running-only
            setCadence(DEFAULT_CADENCE.cycling);
          }}
        >
          <Text style={[styles.modeTabText, activity === 'cycling' && styles.modeTabTextActive]}>Cycling</Text>
        </Pressable>
      </View>

      {activity === 'running' && (
        <View style={[styles.modeSwitch, styles.subModeSwitch]}>
          <Pressable
            style={[styles.modeTab, inputMode === 'cadence' && styles.modeTabActive]}
            onPress={() => setInputMode('cadence')}
          >
            <Text style={[styles.modeTabText, inputMode === 'cadence' && styles.modeTabTextActive]}>By cadence</Text>
          </Pressable>
          <Pressable
            style={[styles.modeTab, inputMode === 'pace' && styles.modeTabActive]}
            onPress={() => setInputMode('pace')}
          >
            <Text style={[styles.modeTabText, inputMode === 'pace' && styles.modeTabTextActive]}>By pace</Text>
          </Pressable>
        </View>
      )}

      {activity === 'running' && inputMode === 'pace' && (
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

      <Text style={styles.label}>
        {activity === 'running' ? 'Target cadence' : 'Target RPM'} ({unit})
      </Text>
      <TextInput
        style={styles.input}
        value={cadence}
        onChangeText={setCadence}
        keyboardType="number-pad"
        placeholder={activity === 'running' ? 'e.g. 170' : 'e.g. 90'}
      />

      <Text style={styles.label}>Tolerance (+/- {unit})</Text>
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
  subModeSwitch: { marginTop: 12 },
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
