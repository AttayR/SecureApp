import { useNavigation } from '@react-navigation/native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';

import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import { copyVaultFileToGallery } from '@/lib/galleryVault';
import { absoluteFilePath, deleteItem, loadItems } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';

function VaultVideoSection({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
  });
  return (
    <VideoView style={styles.video} player={player} nativeControls contentFit="contain" />
  );
}

function VaultAudioSection({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const toggle = () => {
    if (status.playing) player.pause();
    else player.play();
  };
  return (
    <View style={styles.audioBox}>
      <Text style={styles.audioLabel}>Private audio</Text>
      <Pressable style={styles.playBtn} onPress={toggle}>
        <LinearGradient
          colors={[...vaultTheme.gradientGold] as [string, string]}
          style={styles.playGrad}>
          <Text style={styles.playBtnText}>{status.playing ? 'Pause' : 'Play'}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function ViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { suppressBackgroundLock } = useAuth();
  const [item, setItem] = useState<VaultItem | null>(null);
  const [loading, setLoading] = useState(true);

  const uri = item ? absoluteFilePath(item.fileName) : '';

  const exitScreen = React.useCallback(() => {
    if (item?.category === 'photo') {
      router.replace('/photos');
      return;
    }
    if (item?.category === 'video') {
      router.replace('/video');
      return;
    }
    if (item?.category === 'audio') {
      router.replace('/audio');
      return;
    }
    if (item?.category === 'document') {
      router.replace('/documents');
      return;
    }
    router.replace('/');
  }, [item?.category, router]);

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
    navigation.setOptions({
      title: item?.name ?? 'Preview',
      headerStyle: { backgroundColor: vaultTheme.headerBg },
      headerTintColor: vaultTheme.champagne,
      headerTitleStyle: { fontWeight: '700' },
      headerShadowVisible: false,
      headerBackVisible: false,
      headerLeft: () => (
        <Pressable style={styles.headerBackBtn} onPress={exitScreen} hitSlop={12}>
          <Text style={styles.headerBackText}>Back</Text>
        </Pressable>
      ),
    });
  }, [exitScreen, item?.name, navigation]);

  const shareFile = async () => {
    if (!item) return;
    const can = await Sharing.isAvailableAsync();
    if (!can) {
      Alert.alert('Sharing is not available on this device.');
      return;
    }
    const releaseExternalFlow = suppressBackgroundLock();
    await Sharing.shareAsync(uri).finally(releaseExternalFlow);
  };

  const confirmReleaseToGallery = () => {
    if (!item || item.category === 'document') return;
    Alert.alert(
      'Release to gallery?',
      'This file will be copied back to your Photos / gallery and removed from the vault.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release',
          onPress: () => {
            void (async () => {
              const releaseExternalFlow = suppressBackgroundLock();
              const ok = await copyVaultFileToGallery(uri).finally(releaseExternalFlow);
              if (!ok) {
                Alert.alert(
                  'Permission needed',
                  'Allow library access so AR Vault can add this file back to your gallery.'
                );
                return;
              }
              await deleteItem(item);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              exitScreen();
            })();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <VaultLuxuryBackground>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={vaultTheme.gold} />
        </View>
      </VaultLuxuryBackground>
    );
  }

  if (!item) {
    return (
      <VaultLuxuryBackground>
        <View style={styles.center}>
          <Text style={styles.muted}>Item not found.</Text>
          <Pressable style={styles.backBtn} onPress={exitScreen}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </VaultLuxuryBackground>
    );
  }

  return (
    <VaultLuxuryBackground>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['rgba(212,175,106,0.15)', 'transparent']}
          style={styles.frameOuter}>
          <View style={styles.frameInner}>
            {item.category === 'photo' ? (
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            ) : null}

            {item.category === 'video' && Platform.OS !== 'web' ? (
              <VaultVideoSection key={uri} uri={uri} />
            ) : null}
            {item.category === 'video' && Platform.OS === 'web' ? (
              <Text style={styles.webFallback}>Video preview is not supported on web.</Text>
            ) : null}

            {item.category === 'audio' && Platform.OS !== 'web' ? (
              <VaultAudioSection key={uri} uri={uri} />
            ) : null}
            {item.category === 'audio' && Platform.OS === 'web' ? (
              <Text style={styles.webFallback}>Audio preview is not supported on web.</Text>
            ) : null}

            {item.category === 'document' ? (
              <View style={styles.docBox}>
                <Text style={styles.docTitle}>Document</Text>
                <Text style={styles.docMeta}>{item.mimeType ?? 'file'}</Text>
                <Pressable style={styles.shareBtn} onPress={() => void shareFile()}>
                  <Text style={styles.shareBtnText}>Share or open externally</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        {item.category !== 'document' && Platform.OS !== 'web' ? (
          <Pressable style={styles.releaseBtn} onPress={confirmReleaseToGallery}>
            <Text style={styles.releaseBtnText}>Release to gallery (remove from vault)</Text>
          </Pressable>
        ) : null}

        {item.category !== 'document' && Platform.OS !== 'web' ? (
          <Pressable style={styles.shareOutline} onPress={() => void shareFile()}>
            <Text style={styles.shareOutlineText}>Export / share (keep in vault)</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerBackBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerBackText: { color: vaultTheme.champagne, fontSize: 16, fontWeight: '600' },
  muted: { color: vaultTheme.textSecondary, fontSize: 16 },
  scroll: { padding: 16, paddingBottom: 48 },
  frameOuter: {
    borderRadius: 22,
    padding: 2,
    marginBottom: 8,
  },
  frameInner: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: vaultTheme.bgElevated,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  image: { width: '100%', height: 380, backgroundColor: vaultTheme.bgDeep },
  video: { width: '100%', height: 300, backgroundColor: '#000' },
  webFallback: { padding: 24, color: vaultTheme.textSecondary, textAlign: 'center' },
  audioBox: { padding: 32, alignItems: 'center', gap: 20 },
  audioLabel: { fontSize: 17, fontWeight: '700', color: vaultTheme.champagne },
  playBtn: { borderRadius: 14, overflow: 'hidden' },
  playGrad: { paddingVertical: 16, paddingHorizontal: 36 },
  playBtnText: { color: '#1a1208', fontWeight: '800', fontSize: 16 },
  docBox: { padding: 22, gap: 14 },
  docTitle: { fontSize: 18, fontWeight: '700', color: vaultTheme.textPrimary },
  docMeta: { color: vaultTheme.textMuted },
  shareBtn: {
    marginTop: 8,
    backgroundColor: vaultTheme.success,
    padding: 16,
    borderRadius: 14,
  },
  shareBtnText: { color: '#0a1f12', fontWeight: '800', textAlign: 'center' },
  releaseBtn: {
    marginTop: 12,
    backgroundColor: vaultTheme.violetDeep,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
  },
  releaseBtnText: { color: vaultTheme.champagne, fontWeight: '800', fontSize: 15 },
  shareOutline: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: vaultTheme.bgGlass,
  },
  shareOutlineText: { color: vaultTheme.champagne, fontWeight: '700' },
  backBtn: { marginTop: 20, padding: 14 },
  backBtnText: { color: vaultTheme.gold, fontWeight: '700' },
});
