import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { setupNotificationResponseHandler } from '../utils/notifications';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Setup notification tap handler
  useEffect(() => {
    const subscription = setupNotificationResponseHandler();
    return () => subscription.remove();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="AuthScreen" options={{ headerShown: true, presentation: 'card' }} />
        <Stack.Screen name="EventDetails" options={{ headerShown: true, title: 'Szczegóły wydarzenia' }} />
        <Stack.Screen name="GroupChat" options={{ headerShown: true, title: 'Czat' }} />
        <Stack.Screen name="UserProfile" options={{ headerShown: true, title: 'Profil użytkownika' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
