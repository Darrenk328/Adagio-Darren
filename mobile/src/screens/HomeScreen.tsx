import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/colors';
import type { MainTabParamList } from '../navigation/MainTabs';

type Props = BottomTabScreenProps<MainTabParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Adagio</Text>
        <Text style={styles.subtitle}>Match your playlist to your running (or cycling) cadence</Text>

        <Pressable style={styles.button} onPress={() => navigation.navigate('Workout')}>
          <Text style={styles.buttonText}>Start a workout</Text>
        </Pressable>

        <View style={styles.recentSection}>
          <Text style={styles.recentLabel}>Recent</Text>
          <Text style={styles.recentEmpty}>No workouts yet — start one to see it here.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '700', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.textMuted, marginBottom: 32, lineHeight: 21 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
  recentSection: { marginTop: 56 },
  recentLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  recentEmpty: { fontSize: 14, color: colors.textMuted },
});
