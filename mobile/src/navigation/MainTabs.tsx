import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/colors';

import HomeScreen from '../screens/HomeScreen';
import WorkoutStack from './WorkoutStack';
import SettingsScreen from '../screens/SettingsScreen';

export type MainTabParamList = {
  Home: undefined;
  Workout: undefined;
  Settings: undefined;
};

type IconName = keyof typeof Ionicons.glyphMap;
const TAB_ICON: Record<keyof MainTabParamList, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Workout: { active: 'walk', inactive: 'walk-outline' },
  Settings: { active: 'settings', inactive: 'settings-outline' },
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons name={focused ? TAB_ICON[route.name].active : TAB_ICON[route.name].inactive} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Workout" component={WorkoutStack} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
