import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';

const tiles: { title: string; subtitle: string; href: '/photos' | '/audio' | '/video' | '/documents'; icon: React.ComponentProps<typeof FontAwesome>['name'] }[] = [
  { title: 'Photos', subtitle: 'Pictures in encrypted storage', href: '/photos', icon: 'picture-o' },
  { title: 'Audio', subtitle: 'Music & recordings', href: '/audio', icon: 'music' },
  { title: 'Video', subtitle: 'Clips & movies', href: '/video', icon: 'file-video-o' },
  { title: 'Documents', subtitle: 'PDFs, files, archives', href: '/documents', icon: 'file-o' },
];

export default function VaultHomeScreen() {
  const router = useRouter();
  const { lock } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Secure vault</Text>
      <Text style={styles.lead}>
        Imports are copied into this app&apos;s private storage and hidden behind your PIN. This is
        not a Samsung Knox container—other apps stay on your phone unchanged; we only gate shortcuts
        and your vault files.
      </Text>
      <View style={styles.grid}>
        {tiles.map((t) => (
          <Pressable
            key={t.href}
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            onPress={() => router.push(t.href)}>
            <FontAwesome name={t.icon} size={28} color="#6e5494" />
            <Text style={styles.tileTitle}>{t.title}</Text>
            <Text style={styles.tileSub}>{t.subtitle}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={({ pressed }) => [styles.lockRow, pressed && { opacity: 0.7 }]} onPress={lock}>
        <FontAwesome name="lock" size={18} color="#f85149" />
        <Text style={styles.lockText}>Lock vault now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  headline: { fontSize: 26, fontWeight: '800', marginBottom: 10 },
  lead: { fontSize: 14, lineHeight: 20, opacity: 0.75, marginBottom: 20 },
  grid: { gap: 12 },
  tile: {
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#333',
    gap: 6,
  },
  tilePressed: { opacity: 0.9 },
  tileTitle: { fontSize: 18, fontWeight: '700' },
  tileSub: { fontSize: 13, opacity: 0.65 },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 28,
    justifyContent: 'center',
  },
  lockText: { color: '#f85149', fontWeight: '600' },
});
