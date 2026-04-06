import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useVaultStats } from '@/hooks/useVaultStats';

const collections: {
  title: string;
  subtitle: string;
  href: '/photos' | '/audio' | '/video' | '/documents';
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  statKey: 'photo' | 'audio' | 'video' | 'document';
}[] = [
  {
    title: 'Photos',
    subtitle: 'Portraits, memories, and private captures',
    href: '/photos',
    icon: 'picture-o',
    statKey: 'photo',
  },
  {
    title: 'Audio',
    subtitle: 'Voice notes, songs, and personal recordings',
    href: '/audio',
    icon: 'music',
    statKey: 'audio',
  },
  {
    title: 'Video',
    subtitle: 'Clips that deserve a private reel',
    href: '/video',
    icon: 'film',
    statKey: 'video',
  },
  {
    title: 'Documents',
    subtitle: 'Letters, PDFs, scans, and contracts',
    href: '/documents',
    icon: 'file-o',
    statKey: 'document',
  },
];

function currentGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function VaultHomeScreen() {
  const router = useRouter();
  const { lock, lastUnlockFormatted } = useAuth();
  const { stats } = useVaultStats();
  const insets = useSafeAreaInsets();
  const greeting = useMemo(() => currentGreeting(), []);
  const mediaCount = stats.photo + stats.video;

  return (
    <VaultLuxuryBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: 42 + Math.max(insets.bottom, 8) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.heroShell}>
          <LinearGradient
            colors={[...vaultTheme.gradientHeroPanel] as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>AR Vault</Text>
                <Text style={styles.heroTitle}>{greeting}</Text>
                <Text style={styles.heroSubtitle}>
                  Your most personal photos, videos, files, and shortcuts stay elegant, hidden, and
                  ready only after you unlock them.
                </Text>
              </View>
              <View style={styles.heroSeal}>
                <LinearGradient
                  colors={[...vaultTheme.gradientGold] as [string, string]}
                  style={styles.heroSealInner}>
                  <FontAwesome name="shield" size={26} color={vaultTheme.bgDeep} />
                </LinearGradient>
              </View>
            </View>

            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatNum}>{stats.total}</Text>
                <Text style={styles.heroStatLabel}>Secured items</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatNum}>{mediaCount}</Text>
                <Text style={styles.heroStatLabel}>Media sealed away</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatNum}>{stats.document}</Text>
                <Text style={styles.heroStatLabel}>Documents tucked in</Text>
              </View>
            </View>

            <View style={styles.heroActions}>
              <Pressable
                style={({ pressed }) => [styles.primaryHeroBtn, pressed && { opacity: 0.92 }]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/photos');
                }}>
                <Text style={styles.primaryHeroBtnText}>Open private gallery</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.secondaryHeroBtn, pressed && { opacity: 0.92 }]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/settings');
                }}>
                <Text style={styles.secondaryHeroBtnText}>Privacy controls</Text>
              </Pressable>
            </View>

            <Text style={styles.heroFootnote}>
              {lastUnlockFormatted
                ? `Last unlock: ${lastUnlockFormatted}`
                : 'Unlock history appears here after your next secure entry.'}
            </Text>
          </LinearGradient>
        </View>

        <View style={styles.pillRow}>
          <View style={styles.infoPill}>
            <FontAwesome name="eye-slash" size={14} color={vaultTheme.gold} />
            <Text style={styles.infoPillText}>Private by default</Text>
          </View>
          <View style={styles.infoPill}>
            <FontAwesome name="shield" size={14} color={vaultTheme.emerald} />
            <Text style={styles.infoPillText}>PIN + biometrics</Text>
          </View>
          <View style={styles.infoPill}>
            <FontAwesome name="archive" size={14} color={vaultTheme.rose} />
            <Text style={styles.infoPillText}>Backup-ready</Text>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>Collections</Text>
          <Text style={styles.sectionTitle}>Choose what you want to protect today</Text>
        </View>

        <View style={styles.collectionGrid}>
          {collections.map((item) => (
            <Pressable
              key={item.href}
              style={({ pressed }) => [styles.collectionWrap, pressed && { opacity: 0.95 }]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(item.href);
              }}>
              <LinearGradient
                colors={[...vaultTheme.gradientTile] as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.collectionCard}>
                <View style={styles.collectionTop}>
                  <View style={styles.collectionIconRing}>
                    <FontAwesome name={item.icon} size={19} color={vaultTheme.champagne} />
                  </View>
                  <View style={styles.collectionCount}>
                    <Text style={styles.collectionCountText}>{stats[item.statKey]}</Text>
                  </View>
                </View>
                <Text style={styles.collectionTitle}>{item.title}</Text>
                <Text style={styles.collectionSubtitle}>{item.subtitle}</Text>
              </LinearGradient>
            </Pressable>
          ))}
        </View>

        <LinearGradient
          colors={['rgba(140,179,154,0.16)', 'rgba(21,17,15,0.96)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.assuranceCard}>
          <View style={styles.assuranceIcon}>
            <FontAwesome name="lock" size={20} color={vaultTheme.champagne} />
          </View>
          <View style={styles.assuranceCopy}>
            <Text style={styles.assuranceTitle}>A calmer vault experience</Text>
            <Text style={styles.assuranceBody}>
              AR Vault keeps the front door simple: clear categories, refined controls, and one
              secure place for everything you never want lying around in the open.
            </Text>
          </View>
        </LinearGradient>

        <Pressable
          style={({ pressed }) => [styles.lockBtn, pressed && { opacity: 0.92 }]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            lock();
          }}>
          <FontAwesome name="lock" size={17} color={vaultTheme.bgDeep} />
          <Text style={styles.lockText}>Seal AR Vault now</Text>
        </Pressable>
      </ScrollView>
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  heroShell: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  heroCard: {
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    shadowColor: vaultTheme.shadowGold,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 7,
  },
  heroTop: {
    flexDirection: 'row',
    gap: 18,
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    color: vaultTheme.goldMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  heroTitle: {
    marginTop: 8,
    color: vaultTheme.textPrimary,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    marginTop: 10,
    color: vaultTheme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  heroSeal: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 1,
  },
  heroSealInner: {
    flex: 1,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStats: {
    flexDirection: 'row',
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(9,7,6,0.3)',
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    alignItems: 'center',
  },
  heroStat: {
    flex: 1,
  },
  heroStatNum: {
    color: vaultTheme.gold,
    fontSize: 24,
    fontWeight: '800',
  },
  heroStatLabel: {
    marginTop: 4,
    color: vaultTheme.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  heroStatDivider: {
    width: 1,
    height: 38,
    backgroundColor: vaultTheme.borderSubtle,
    marginHorizontal: 10,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  primaryHeroBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: vaultTheme.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryHeroBtnText: {
    color: vaultTheme.bgDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryHeroBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryHeroBtnText: {
    color: vaultTheme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  heroFootnote: {
    marginTop: 14,
    color: vaultTheme.textMuted,
    fontSize: 12,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: vaultTheme.bgSurface,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  infoPillText: {
    color: vaultTheme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHead: {
    paddingHorizontal: 16,
    marginTop: 28,
    marginBottom: 14,
  },
  sectionEyebrow: {
    color: vaultTheme.goldMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    marginTop: 8,
    color: vaultTheme.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
  },
  collectionWrap: {
    width: '48%',
    borderRadius: 22,
  },
  collectionCard: {
    minHeight: 168,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  collectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  collectionIconRing: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  collectionCount: {
    minWidth: 32,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,7,6,0.42)',
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  collectionCountText: {
    color: vaultTheme.gold,
    fontSize: 13,
    fontWeight: '800',
  },
  collectionTitle: {
    color: vaultTheme.textPrimary,
    fontSize: 19,
    fontWeight: '800',
  },
  collectionSubtitle: {
    marginTop: 6,
    color: vaultTheme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  assuranceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  assuranceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  assuranceCopy: {
    flex: 1,
  },
  assuranceTitle: {
    color: vaultTheme.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  assuranceBody: {
    marginTop: 6,
    color: vaultTheme.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: vaultTheme.gold,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  lockText: {
    color: vaultTheme.bgDeep,
    fontWeight: '800',
    fontSize: 16,
  },
});
