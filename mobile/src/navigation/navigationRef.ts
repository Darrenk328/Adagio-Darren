import { createNavigationContainerRef } from '@react-navigation/native';

// Lets code outside the navigation tree (the persistent workout banner,
// rendered as a plain sibling of the tab navigator rather than one of its
// screens, so it has no navigation context of its own) jump to a tab.
// Lives in its own module, separate from AppNavigator, so that importing
// it (from WorkoutBanner, which MainTabs renders) doesn't create a require
// cycle back through AppNavigator -> MainTabs -> WorkoutBanner.
export const navigationRef = createNavigationContainerRef();
