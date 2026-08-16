import type { GalleryRestoreTarget } from '@/types/vault';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export type ToastRequest = {
  tone: ToastTone;
  title: string;
  message?: string;
  durationMs?: number;
};

export type ConfirmRequest = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** If true, only a single primary button is shown (no cancel). */
  ackOnly?: boolean;
};

export type RestorePlaceRequest = {
  title: string;
  message?: string;
  originalHint?: string;
  folderDefault?: string;
};

type NotifyBridge = {
  showToast: (toast: ToastRequest) => void;
  showConfirm: (request: ConfirmRequest) => Promise<boolean>;
  showRestorePlace: (request: RestorePlaceRequest) => Promise<GalleryRestoreTarget | null>;
};

let bridge: NotifyBridge | null = null;

export function registerNotifyBridge(next: NotifyBridge | null) {
  bridge = next;
}

function requireBridge(): NotifyBridge {
  if (!bridge) {
    throw new Error('Notify bridge is not mounted. Wrap the app with <NotifyProvider />.');
  }
  return bridge;
}

/** Lightweight feedback — replaces informational Alert.alert calls. */
export const toast = {
  success(title: string, message?: string, durationMs = 2800) {
    requireBridge().showToast({ tone: 'success', title, message, durationMs });
  },
  error(title: string, message?: string, durationMs = 3400) {
    requireBridge().showToast({ tone: 'error', title, message, durationMs });
  },
  info(title: string, message?: string, durationMs = 2800) {
    requireBridge().showToast({ tone: 'info', title, message, durationMs });
  },
  warning(title: string, message?: string, durationMs = 3200) {
    requireBridge().showToast({ tone: 'warning', title, message, durationMs });
  },
};

/**
 * Themed confirm / ack sheet — replaces Alert.alert with buttons.
 * Resolves true when confirmed, false when cancelled/dismissed.
 */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  return requireBridge().showConfirm(request);
}

/** Ask whether to restore media to the original album or a new gallery folder. */
export function pickRestorePlace(request: RestorePlaceRequest): Promise<GalleryRestoreTarget | null> {
  return requireBridge().showRestorePlace(request);
}
