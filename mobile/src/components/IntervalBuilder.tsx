import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { parseDurationString, formatDuration } from '../utils/duration';
import { parsePaceString, estimateCadenceFromPace, PaceUnit } from '../utils/paceToCadence';
import { warmupTempoCooldownPreset, fiveIntervalsPreset } from '../utils/intervalPresets';
import type { Segment } from '../types/workout';

type Activity = 'running' | 'cycling';

type Props = {
  activity: Activity;
  unit: string;
  paceUnit: PaceUnit;
  segments: Segment[];
  onChange: (segments: Segment[]) => void;
  /** Rendered above the presets/segment list, scrolling together with it. */
  header?: React.ReactNode;
  /** Rendered below the "Add segment" button, scrolling together with the list. */
  footer?: React.ReactNode;
};

function newSegment(unit: string): Segment {
  return {
    id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: 'Segment',
    durationSec: 60,
    target: unit === 'RPM' ? 90 : 170,
  };
}

export default function IntervalBuilder({ activity, unit, paceUnit, segments, onChange, header, footer }: Props) {
  const applyPreset = (build: (a: Activity) => Segment[]) => {
    const apply = () => onChange(build(activity));
    if (segments.length > 0) {
      Alert.alert('Replace segments?', 'This will replace your current segments with the preset.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: apply },
      ]);
    } else {
      apply();
    }
  };

  const updateSegment = (id: string, patch: Partial<Segment>) => {
    onChange(segments.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const duplicateSegment = (segment: Segment) => {
    const index = segments.findIndex((s) => s.id === segment.id);
    const copy = { ...segment, id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    const next = [...segments];
    next.splice(index + 1, 0, copy);
    onChange(next);
  };

  const deleteSegment = (id: string) => onChange(segments.filter((s) => s.id !== id));
  const addSegment = () => onChange([...segments, newSegment(unit)]);

  const moveSegment = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= segments.length) return;
    const next = [...segments];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(next);
  };

  const totalDuration = segments.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <View style={styles.container}>
      {/* A fixed (non-scrolling) sibling above the list, not a
          ListHeaderComponent — kept from the earlier drag-and-drop layout
          since it's a proven-reliable structure (see FlatList-swallows-
          sibling-touches note in project memory). */}
      <View style={styles.fixedHeader}>
        {header}
        <Text style={styles.label}>Presets</Text>
        <View style={styles.presetRow}>
          <Pressable style={styles.presetChip} onPress={() => applyPreset(warmupTempoCooldownPreset)}>
            <Text style={styles.presetChipText}>Warm-up / Tempo / Cool-down</Text>
          </Pressable>
          <Pressable style={styles.presetChip} onPress={() => applyPreset(fiveIntervalsPreset)}>
            <Text style={styles.presetChipText}>5x intervals</Text>
          </Pressable>
        </View>
        {segments.length > 0 && (
          <Text style={styles.totalText}>
            {segments.length} segment{segments.length === 1 ? '' : 's'} · {formatDuration(totalDuration)} total
          </Text>
        )}
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={segments}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <SegmentRow
            segment={item}
            unit={unit}
            paceUnit={paceUnit}
            activity={activity}
            canMoveUp={index > 0}
            canMoveDown={index < segments.length - 1}
            onMoveUp={() => moveSegment(index, -1)}
            onMoveDown={() => moveSegment(index, 1)}
            onUpdate={(patch) => updateSegment(item.id, patch)}
            onDuplicate={() => duplicateSegment(item)}
            onDelete={() => deleteSegment(item.id)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No segments yet. Add one below or use a preset.</Text>}
        ListFooterComponent={
          <>
            <Pressable style={styles.addButton} onPress={addSegment}>
              <Ionicons name="add" size={18} color={colors.text} />
              <Text style={styles.addButtonText}>Add segment</Text>
            </Pressable>
            {footer}
          </>
        }
      />
    </View>
  );
}

function SegmentRow({
  segment,
  unit,
  paceUnit,
  activity,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onDuplicate,
  onDelete,
}: {
  segment: Segment;
  unit: string;
  paceUnit: PaceUnit;
  activity: Activity;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (patch: Partial<Segment>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [durationText, setDurationText] = useState(formatDuration(segment.durationSec));
  const [targetText, setTargetText] = useState(String(segment.target));
  const [showPace, setShowPace] = useState(false);
  const [paceInput, setPaceInput] = useState('');

  const handleDurationBlur = () => {
    const seconds = parseDurationString(durationText);
    if (seconds !== null) {
      onUpdate({ durationSec: seconds });
    } else {
      setDurationText(formatDuration(segment.durationSec));
    }
  };

  const handleTargetBlur = () => {
    const value = Number(targetText);
    if (value > 0) {
      onUpdate({ target: value });
    } else {
      setTargetText(String(segment.target));
    }
  };

  const handlePaceChange = (text: string) => {
    setPaceInput(text);
    const seconds = parsePaceString(text);
    if (seconds !== null) {
      const cadence = estimateCadenceFromPace(seconds, paceUnit);
      setTargetText(String(cadence));
      onUpdate({ target: cadence });
    }
  };

  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.moveColumn}>
        <Pressable onPress={onMoveUp} disabled={!canMoveUp} hitSlop={8} style={rowStyles.moveButton}>
          <Ionicons name="chevron-up" size={18} color={canMoveUp ? colors.textMuted : colors.border} />
        </Pressable>
        <Pressable onPress={onMoveDown} disabled={!canMoveDown} hitSlop={8} style={rowStyles.moveButton}>
          <Ionicons name="chevron-down" size={18} color={canMoveDown ? colors.textMuted : colors.border} />
        </Pressable>
      </View>

      <View style={rowStyles.fields}>
        <TextInput
          style={rowStyles.labelInput}
          value={segment.label}
          onChangeText={(text) => onUpdate({ label: text })}
          placeholder="Segment name"
          placeholderTextColor={colors.textMuted}
        />
        <View style={rowStyles.inputRow}>
          <View style={rowStyles.inputGroup}>
            <Text style={rowStyles.inputCaption}>Duration</Text>
            <TextInput
              style={rowStyles.smallInput}
              value={durationText}
              onChangeText={setDurationText}
              onBlur={handleDurationBlur}
              keyboardType="numbers-and-punctuation"
              placeholder="mm:ss"
            />
          </View>
          <View style={rowStyles.inputGroup}>
            <Text style={rowStyles.inputCaption}>{showPace ? `Pace (/${paceUnit})` : `Target (${unit})`}</Text>
            {showPace ? (
              <TextInput
                style={rowStyles.smallInput}
                value={paceInput}
                onChangeText={handlePaceChange}
                onBlur={() => setShowPace(false)}
                keyboardType="numbers-and-punctuation"
                placeholder={paceUnit === 'mi' ? 'e.g. 7:30' : 'e.g. 4:40'}
                autoFocus
              />
            ) : (
              <TextInput
                style={rowStyles.smallInput}
                value={targetText}
                onChangeText={setTargetText}
                onBlur={handleTargetBlur}
                keyboardType="number-pad"
              />
            )}
          </View>
          {activity === 'running' && (
            <Pressable onPress={() => setShowPace((v) => !v)} style={rowStyles.paceToggle}>
              <Text style={rowStyles.paceToggleText}>{showPace ? unit : 'Pace'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={rowStyles.actions}>
        <Pressable onPress={onDuplicate} hitSlop={8} style={rowStyles.actionButton}>
          <Ionicons name="copy-outline" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8} style={rowStyles.actionButton}>
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  fixedHeader: { paddingHorizontal: 24, paddingTop: 24 },
  list: { flex: 1 },
  listContent: { padding: 24, paddingTop: 0, paddingBottom: 48 },
  label: { fontSize: 14, color: colors.textMuted, marginBottom: 8 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  presetChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  presetChipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  totalText: { fontSize: 13, color: colors.textMuted, marginBottom: 12 },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 8,
    gap: 6,
  },
  addButtonText: { fontSize: 14, fontWeight: '600', color: colors.text },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  moveColumn: { alignItems: 'center', paddingTop: 2, paddingRight: 6 },
  moveButton: { paddingVertical: 2 },
  fields: { flex: 1 },
  labelInput: { fontSize: 15, fontWeight: '600', color: colors.text, paddingVertical: 4, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  inputGroup: {},
  inputCaption: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
  smallInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    color: colors.text,
    minWidth: 72,
  },
  paceToggle: { paddingVertical: 8, paddingHorizontal: 4 },
  paceToggleText: { fontSize: 12, fontWeight: '600', color: colors.secondary },
  actions: { flexDirection: 'row', gap: 4, paddingTop: 4 },
  actionButton: { padding: 4 },
});
