import { useNavigation } from '@react-navigation/native';
import { Audio, ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import * as Sharing from 'expo-sharing';

import { Text, View } from '@/components/Themed';
import { absoluteFilePath, loadItems } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';

export default function ViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [item, setItem] = useState<VaultItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  const uri = item ? absoluteFilePath(item.fileName) : '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      const all = await loadItems();
      const found = all.find((x) => x.id === id) ?? null;
      if (!cancelled) {
        setItem(found);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useLayoutEffect(() => {
    if (item?.name) navigation.setOptions({ title: item.name });
  }, [item?.name, navigation]);

  useEffect(() => {
    return () => {
      void sound?.unloadAsync();
    };
  }, [sound]);

  const shareFile = async () => {
    if (!item) return;
    const can = await Sharing.isAvailableAsync();
    if (!can) {
      Alert.alert('Sharing is not available on this device.');
      return;
    }
    await Sharing.shareAsync(uri);
  };

  const toggleAudio = async () => {
    if (!item || item.category !== 'audio') return;
    if (sound) {
      if (playing) await sound.pauseAsync();
      else await sound.playAsync();
      setPlaying(!playing);
      return;
    }
    const { sound: s } = await Audio.Sound.createAsync({ uri });
    setSound(s);
    s.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) setPlaying(false);
    });
    await s.playAsync();
    setPlaying(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <Text>Item not found.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
        {item.category === 'photo' ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : null}

        {item.category === 'video' ? (
          <Video
            style={styles.video}
            source={{ uri }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping={false}
          />
        ) : null}

        {item.category === 'audio' ? (
          <View style={styles.audioBox}>
            <Text style={styles.audioLabel}>Audio</Text>
            <Pressable style={styles.playBtn} onPress={() => void toggleAudio()}>
              <Text style={styles.playBtnText}>{playing ? 'Pause' : 'Play'}</Text>
            </Pressable>
          </View>
        ) : null}

        {item.category === 'document' ? (
          <View style={styles.docBox}>
            <Text style={styles.docTitle}>Document</Text>
            <Text style={styles.docMeta}>{item.mimeType ?? 'file'}</Text>
            <Pressable style={styles.shareBtn} onPress={() => void shareFile()}>
              <Text style={styles.shareBtnText}>Share / open in another app</Text>
            </Pressable>
          </View>
        ) : null}

        {item.category !== 'document' && Platform.OS !== 'web' ? (
          <Pressable style={styles.shareOutline} onPress={() => void shareFile()}>
            <Text style={styles.shareOutlineText}>Export / share</Text>
          </Pressable>
        ) : null}
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 16, paddingBottom: 40 },
  image: { width: '100%', height: 360, backgroundColor: '#111' },
  video: { width: '100%', height: 280, backgroundColor: '#000' },
  audioBox: { padding: 24, alignItems: 'center', gap: 16 },
  audioLabel: { fontSize: 18, fontWeight: '600' },
  playBtn: { backgroundColor: '#6e5494', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12 },
  playBtnText: { color: '#fff', fontWeight: '600' },
  docBox: { padding: 16, gap: 12 },
  docTitle: { fontSize: 18, fontWeight: '600' },
  docMeta: { opacity: 0.7 },
  shareBtn: { marginTop: 8, backgroundColor: '#238636', padding: 14, borderRadius: 12 },
  shareBtnText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  shareOutline: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#6e5494',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareOutlineText: { color: '#6e5494', fontWeight: '600' },
  backBtn: { marginTop: 16, padding: 12 },
  backBtnText: { color: '#58a6ff' },
});
