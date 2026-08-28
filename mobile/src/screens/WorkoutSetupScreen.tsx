import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { parsePaceString, estimateCadenceFromPace, PaceUnit } from '../utils/paceToCadence';
import { useSettings } from '../settings/SettingsContext';
import { useAuth } from '../auth/AuthContext';
import { fetchPlaylistTracks, matchTracks } from '../api/client';
import IntervalBuilder from '../components/IntervalBuilder';
import type { Segment } from '../types/workout';
import type { WorkoutStackParamList } from '../navigation/WorkoutStack';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutSetup'>;

type WorkoutMode = 'single' | 'intervals';
type InputMode = 'cadence' | 'pace';
type Activity = 'running' | 'cycling';

const UNIT: Record<Activity, string> = { running: 'SPM', cycling: 'RPM' };
const DEFAULT_CADENCE: Record<Activity, string> = { running: '170', cycling: '90' };

export default function WorkoutSetupScreen({ route, navigation }: Props) {
  const { playlistId, playlistName } = route.params;
  const { defaultTolerance } = useSettings();
  const { accessToken } = useAuth();

  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>('single');
  const [activity, setActivity] = useState<Activity>('running');
  const [isStartingIntervals, setIsStartingIntervals] = useState(false);

  // Single-mode state
  const [inputMode, setInputMode] = useState<InputMode>('cadence');
  const [cadence, setCadence] = useState('170');
  const [tolerance, setTolerance] = useState(String(defaultTolerance));
  const [paceInput, setPaceInput] = useState('');
  // Shared across Single mode's pace field and every segment's pace field in
  // Intervals mode — one unit for the whole workout, not per-field.
  const [paceUnit, setPaceUnit] = useState<PaceUnit>('mi');

  // Intervals-mode state
  const [segments, setSegments] = useState<Segment[]>([]);

  const unit = UNIT[activity];
  const paceSeconds = parsePaceString(paceInput);
  const isPaceInvalid = activity === 'running' && inputMode === 'pace' && paceInput.length > 0 && paceSeconds === null;

  const handleActivityChange = (next: Activity) => {
    setActivity(next);
    setCadence(DEFAULT_CADENCE[next]);
    if (next === 'cycling') setInputMode('cadence'); // pace-based input is running-only
  };

  const handlePaceChange = (text: string) => {
    setPaceInput(text);
    const seconds = parsePaceString(text);
    if (seconds !== null) {
      setCadence(String(estimateCadenceFromPace(seconds, paceUnit)));
    }
  };

  const handlePaceUnitChange = (next: PaceUnit) => {
    setPaceUnit(next);
    // Re-estimate immediately so the displayed cadence reflects the unit
    // that's actually selected, not stale math from the old one.
    const seconds = parsePaceString(paceInput);
    if (seconds !== null) {
      setCadence(String(estimateCadenceFromPace(seconds, next)));
    }
  };

  const handleSingleSubmit = () => {
    const cadenceNum = Number(cadence);
    const toleranceNum = Number(tolerance);
    if (!cadenceNum || cadenceNum <= 0) return;

    navigation.navigate('Results', {
      playlistId,
      playlistName,
      cadence: cadenceNum,
      tolerance: toleranceNum || defaultTolerance,
      unit,
    });
  };

  const handleStartIntervalWorkout = async () => {
    if (segments.length === 0) {
      Alert.alert('Add at least one segment', 'Build your interval workout before starting.');
      return;
    }
    if (!accessToken) return;

    setIsStartingIntervals(true);
    try {
      // Matches the first segment's target to build the initial queue.
      // Re-matching + swapping the queue as later segments start is a
      // follow-up — for now the same queue plays through the whole workout.
      const tracks = await fetchPlaylistTracks(accessToken, playlistId);
      const result = await matchTracks(tracks, segments[0].target, defaultTolerance);

      if (result.matches.length === 0) {
        Alert.alert('No matches found', "Couldn't find any songs matching the first segment's target tempo.");
        return;
      }

      navigation.navigate('NowPlaying', { playlistName, queue: result.matches, segments, unit });
    } catch (err) {
      Alert.alert('Something went wrong', 'Could not load matching songs for this workout.');
    } finally {
      setIsStartingIntervals(false);
    }
  };

  // Shared between Single and Intervals modes — the playlist name plus the
  // Single/Intervals and Running/Cycling toggles.
  const sharedHeader = (
    <View>
      <Text style={styles.header}>{playlistName}</Text>

      <View style={styles.modeSwitch}>
        <Pressable
          style={[styles.modeTab, workoutMode === 'single' && styles.modeTabActive]}
          onPress={() => setWorkoutMode('single')}
        >
          <Text style={[styles.modeTabText, workoutMode === 'single' && styles.modeTabTextActive]}>Single</Text>
        </Pressable>
        <Pressable
          style={[styles.modeTab, workoutMode === 'intervals' && styles.modeTabActive]}
          onPress={() => setWorkoutMode('intervals')}
        >
          <Text style={[styles.modeTabText, workoutMode === 'intervals' && styles.modeTabTextActive]}>
            Intervals
          </Text>
        </Pressable>
      </View>

      <View style={[styles.modeSwitch, styles.subModeSwitch]}>
        <Pressable
          style={[styles.modeTab, activity === 'running' && styles.modeTabActive]}
          onPress={() => handleActivityChange('running')}
        >
          <Text style={[styles.modeTabText, activity === 'running' && styles.modeTabTextActive]}>Running</Text>
        </Pressable>
        <Pressable
          style={[styles.modeTab, activity === 'cycling' && styles.modeTabActive]}
          onPress={() => handleActivityChange('cycling')}
        >
          <Text style={[styles.modeTabText, activity === 'cycling' && styles.modeTabTextActive]}>Cycling</Text>
        </Pressable>
      </View>

      {activity === 'running' && (
        <View style={styles.unitRow}>
          <Text style={styles.unitLabel}>Pace unit</Text>
          <View style={styles.unitToggle}>
            <Pressable
              style={[styles.unitButton, paceUnit === 'mi' && styles.unitButtonActive]}
              onPress={() => handlePaceUnitChange('mi')}
            >
              <Text style={[styles.unitButtonText, paceUnit === 'mi' && styles.unitButtonTextActive]}>mi</Text>
            </Pressable>
            <Pressable
              style={[styles.unitButton, paceUnit === 'km' && styles.unitButtonActive]}
              onPress={() => handlePaceUnitChange('km')}
            >
              <Text style={[styles.unitButtonText, paceUnit === 'km' && styles.unitButtonTextActive]}>km</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  if (workoutMode === 'intervals') {
    // No outer ScrollView here on purpose: the segment list's drag-to-reorder
    // gesture needs to own touch handling, and nesting it inside a plain
    // scroll container causes them to fight over the gesture. IntervalBuilder
    // is the single scrollable surface instead, with the shared header/start
    // button passed in so everything still scrolls together.
    return (
      <IntervalBuilder
        activity={activity}
        unit={unit}
        paceUnit={paceUnit}
        segments={segments}
        onChange={setSegments}
        header={sharedHeader}
        footer={
          <Pressable
            style={[styles.button, isStartingIntervals && styles.buttonDisabled]}
            onPress={handleStartIntervalWorkout}
            disabled={isStartingIntervals}
          >
            {isStartingIntervals ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.buttonText}>Start workout</Text>
            )}
          </Pressable>
        }
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {sharedHeader}

      {activity === 'running' && (
        <View style={[styles.modeSwitch, styles.subModeSwitch]}>
          <Pressable
            style={[styles.modeTab, inputMode === 'cadence' && styles.modeTabActive]}
            onPress={() => setInputMode('cadence')}
          >
            <Text style={[styles.modeTabText, inputMode === 'cadence' && styles.modeTabTextActive]}>
              By cadence
            </Text>
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
          <Text style={styles.label}>Pace (min:sec per {paceUnit === 'mi' ? 'mile' : 'km'})</Text>
          <TextInput
            style={[styles.input, isPaceInvalid && styles.inputError]}
            value={paceInput}
            onChangeText={handlePaceChange}
            keyboardType="numbers-and-punctuation"
            placeholder={paceUnit === 'mi' ? 'e.g. 7:30' : 'e.g. 4:40'}
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
      <TextInput style={styles.input} value={tolerance} onChangeText={setTolerance} keyboardType="number-pad" />

      <Pressable style={styles.button} onPress={handleSingleSubmit}>
        <Text style={styles.buttonText}>Find matching songs</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 48 },
  header: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 24 },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  subModeSwitch: { marginTop: 12 },
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  unitLabel: { fontSize: 13, color: colors.textMuted },
  unitToggle: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: 8, padding: 3 },
  unitButton: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 6 },
  unitButtonActive: { backgroundColor: colors.surface },
  unitButtonText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  unitButtonTextActive: { color: colors.text },
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
  buttonDisabled: { opacity: 0.6 },
});
