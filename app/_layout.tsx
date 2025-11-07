// app/_layout.tsx
import { Stack } from 'expo-router';
import 'react-native-reanimated';
import { AuthProvider } from '../context/AuthContext';
import { LocationProvider } from '../context/LocationContext';
import '../i18n';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <LocationProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
      </LocationProvider>
    </AuthProvider>
  );
}
