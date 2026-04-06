import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VaultHeaderBackground, VaultHeaderTitle } from '@/components/VaultChrome';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { vaultTheme } from '@/constants/vaultTheme';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -1 }} {...props} />;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);

  return (
    <Tabs
      safeAreaInsets={{ bottom: bottomPad, top: 0, left: 0, right: 0 }}
      screenOptions={{
        tabBarActiveTintColor: vaultTheme.gold,
        tabBarInactiveTintColor: vaultTheme.textMuted,
        tabBarBackground: () => (
          <LinearGradient
            colors={[...vaultTheme.gradientTab] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: vaultTheme.tabBarBorder,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 64 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.25 },
        headerBackground: () => <VaultHeaderBackground />,
        headerStyle: {
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: vaultTheme.champagne,
        headerTitleAlign: 'left',
        headerTitle: ({ children }) => <VaultHeaderTitle title={String(children)} />,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerLeftContainerStyle: { paddingLeft: 8 },
        headerRightContainerStyle: { paddingRight: 8 },
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon name="lock" color={color} />,
        }}
      />
      <Tabs.Screen name="photos" options={{ title: 'Photos', href: null }} />
      <Tabs.Screen name="audio" options={{ title: 'Audio', href: null }} />
      <Tabs.Screen name="video" options={{ title: 'Video', href: null }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents', href: null }} />
      <Tabs.Screen
        name="apps"
        options={{
          title: 'Apps',
          tabBarIcon: ({ color }) => <TabBarIcon name="th" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
        }}
      />
    </Tabs>
  );
}
