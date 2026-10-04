import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { VaultHeaderBackground, VaultHeaderTitle } from '@/components/VaultChrome';
import { VaultAuthScreens } from '@/components/VaultAuthScreens';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { vaultTheme } from '@/constants/vaultTheme';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const vaultNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: vaultTheme.gold,
    background: vaultTheme.bgDeep,
    card: vaultTheme.headerBg,
    text: vaultTheme.textPrimary,
    border: vaultTheme.borderSubtle,
    notification: vaultTheme.danger,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <View style={styles.fill}>
        <RootLayoutNav />
        <PrivacyCover />
      </View>
    </AuthProvider>
  );
}

/**
 * Covers the screen whenever the app is not in the foreground, so the app switcher
 * snapshot never shows vault content.
 */
function PrivacyCover() {
  const [state, setState] = useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', setState);
    return () => sub.remove();
  }, []);
  if (state === 'active') return null;
  return (
    <View style={styles.cover} pointerEvents="none">
      <FontAwesome name="lock" size={44} color={vaultTheme.champagne} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.bgDeep,
  },
});

function RootLayoutNav() {
  const auth = useAuth();
  const theme = useMemo(() => vaultNavigationTheme, []);

  if (!auth.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: vaultTheme.bgDeep }}>
        <ActivityIndicator size="large" color={vaultTheme.gold} />
      </View>
    );
  }

  if (!auth.unlocked) {
    return (
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <VaultAuthScreens />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: vaultTheme.bgDeep },
          headerBackground: () => <VaultHeaderBackground />,
          headerTitleAlign: 'left',
          headerTitle: ({ children }) => <VaultHeaderTitle title={String(children)} />,
          headerTintColor: vaultTheme.champagne,
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="viewer"
          options={{
            title: 'Preview',
          }}
        />
        <Stack.Screen
          name="gallery-move"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
