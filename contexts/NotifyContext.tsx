import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { vaultTheme } from '@/constants/vaultTheme';
import {
  registerNotifyBridge,
  type ConfirmRequest,
  type ToastRequest,
  type ToastTone,
} from '@/lib/notify';

type ActiveToast = ToastRequest & { id: number };

type ActiveConfirm = ConfirmRequest & {
  id: number;
  resolve: (value: boolean) => void;
};

const TOAST_ICON: Record<ToastTone, React.ComponentProps<typeof FontAwesome>['name']> = {
  success: 'check-circle',
  error: 'exclamation-circle',
  info: 'info-circle',
  warning: 'exclamation-triangle',
};

const TOAST_ACCENT: Record<ToastTone, string> = {
  success: vaultTheme.success,
  error: vaultTheme.danger,
  info: vaultTheme.gold,
  warning: '#e0a86a',
};

export function NotifyProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const [confirmState, setConfirmState] = useState<ActiveConfirm | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslate = useRef(new Animated.Value(18)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const hideToast = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(toastTranslate, { toValue: 18, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [toastOpacity, toastTranslate]);

  const showToast = useCallback(
    (request: ToastRequest) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      const id = ++seq.current;
      setToast({ ...request, id });
      toastOpacity.setValue(0);
      toastTranslate.setValue(18);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(toastTranslate, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();
      });
      hideTimer.current = setTimeout(() => {
        hideToast();
      }, request.durationMs ?? 2800);
    },
    [hideToast, toastOpacity, toastTranslate]
  );

  const showConfirm = useCallback((request: ConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      const id = ++seq.current;
      setConfirmState({ ...request, id, resolve });
    });
  }, []);

  useEffect(() => {
    registerNotifyBridge({ showToast, showConfirm });
    return () => registerNotifyBridge(null);
  }, [showConfirm, showToast]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const closeConfirm = useCallback((value: boolean) => {
    setConfirmState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const accent = toast ? TOAST_ACCENT[toast.tone] : vaultTheme.gold;

  return (
    <View style={styles.root}>
      {children}

      {/* Modal keeps toast above Android native stack screens (e.g. Move Photos). */}
      <Modal
        visible={toast != null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={hideToast}>
        <View style={styles.toastModalRoot} pointerEvents="box-none">
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.toastWrap,
              {
                bottom: Math.max(insets.bottom, 12) + 72,
                opacity: toastOpacity,
                transform: [{ translateY: toastTranslate }],
              },
            ]}>
            {toast ? (
              <Pressable
                onPress={hideToast}
                style={[styles.toastCard, { borderColor: accent }]}
                accessibilityRole="alert">
                <FontAwesome name={TOAST_ICON[toast.tone]} size={18} color={accent} />
                <View style={styles.toastCopy}>
                  <Text style={styles.toastTitle} numberOfLines={2}>
                    {toast.title}
                  </Text>
                  {toast.message ? (
                    <Text style={styles.toastMessage} numberOfLines={4}>
                      {toast.message}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={confirmState != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => closeConfirm(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => closeConfirm(false)} />
          <View style={[styles.confirmCard, { marginBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.confirmTitle}>{confirmState?.title}</Text>
            {confirmState?.message ? (
              <Text style={styles.confirmMessage}>{confirmState.message}</Text>
            ) : null}
            <View style={styles.confirmActions}>
              {!confirmState?.ackOnly ? (
                <Pressable
                  style={({ pressed }) => [styles.confirmBtnGhost, pressed && styles.pressed]}
                  onPress={() => closeConfirm(false)}>
                  <Text style={styles.confirmBtnGhostText}>
                    {confirmState?.cancelLabel ?? 'Cancel'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.confirmBtnPrimary,
                  confirmState?.destructive && styles.confirmBtnDanger,
                  pressed && styles.pressed,
                  confirmState?.ackOnly && styles.confirmBtnFull,
                ]}
                onPress={() => closeConfirm(true)}>
                <Text
                  style={[
                    styles.confirmBtnPrimaryText,
                    confirmState?.destructive && styles.confirmBtnDangerText,
                  ]}>
                  {confirmState?.confirmLabel ?? (confirmState?.ackOnly ? 'OK' : 'Confirm')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toastModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  toastWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(22,17,15,0.97)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  toastCopy: { flex: 1, gap: 3 },
  toastTitle: {
    color: vaultTheme.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  toastMessage: {
    color: vaultTheme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmCard: {
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 20,
    backgroundColor: vaultTheme.bgCard,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    gap: 10,
  },
  confirmTitle: {
    color: vaultTheme.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  confirmMessage: {
    color: vaultTheme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  confirmBtnGhost: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    backgroundColor: vaultTheme.bgGlass,
  },
  confirmBtnGhostText: {
    color: vaultTheme.champagne,
    fontWeight: '700',
    fontSize: 15,
  },
  confirmBtnPrimary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: vaultTheme.gold,
  },
  confirmBtnFull: { flex: 1 },
  confirmBtnPrimaryText: {
    color: vaultTheme.bgDeep,
    fontWeight: '800',
    fontSize: 15,
  },
  confirmBtnDanger: {
    backgroundColor: 'rgba(222,113,109,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(222,113,109,0.45)',
  },
  confirmBtnDangerText: {
    color: vaultTheme.danger,
  },
  pressed: { opacity: 0.85 },
});
