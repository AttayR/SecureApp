import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';

import { clearVaultVideoThumb } from '@/components/VaultVideoThumb';
import { pickRestorePlace, toast } from '@/lib/notify';
import { DEFAULT_RESTORE_FOLDER, vaultItemHasOriginalLocation } from '@/lib/galleryVault';
import { filterVaultItems, releaseVaultItemsToGallery, shareVaultItems } from '@/lib/vaultMediaActions';
import type { VaultItem } from '@/types/vault';

export function useVaultBatchSelection(items: VaultItem[], searchQuery: string) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const visibleItems = useMemo(
    () => filterVaultItems(items, searchQuery),
    [items, searchQuery]
  );

  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selectedIds.has(item.id)),
    [selectedIds, visibleItems]
  );

  const selectedCount = selectedItems.length;
  const allVisibleSelected = visibleItems.length > 0 && selectedCount === visibleItems.length;

  const enterSelection = useCallback((item?: VaultItem) => {
    setSelecting(true);
    setSelectedIds(() => (item ? new Set([item.id]) : new Set()));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((item: VaultItem) => {
    setSelecting(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelecting(true);
    setSelectedIds(new Set(visibleItems.map((item) => item.id)));
    void Haptics.selectionAsync();
  }, [visibleItems]);

  const clearSelected = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selecting,
    selectedIds,
    selectedItems,
    selectedCount,
    allVisibleSelected,
    visibleCount: visibleItems.length,
    enterSelection,
    exitSelection,
    toggleSelect,
    selectAllVisible,
    clearSelected,
  };
}

export function useVaultBatchActions({
  noun,
  selectedItems,
  suppressBackgroundLock,
  refresh,
  exitSelection,
}: {
  noun: 'photo' | 'video';
  selectedItems: VaultItem[];
  suppressBackgroundLock: (timeoutMs?: number) => () => void;
  refresh: () => Promise<void> | void;
  exitSelection: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const plural = `${noun}${selectedItems.length === 1 ? '' : 's'}`;

  const shareSelected = useCallback(() => {
    if (busy || selectedItems.length === 0) return;
    void (async () => {
      setBusy(true);
      try {
        const mode = await shareVaultItems(selectedItems, suppressBackgroundLock);
        if (mode === 'first-only') {
          toast.info(
            'Shared 1 item',
            `This device can share one ${noun} at a time. Select the rest and share again.`
          );
        }
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (code === 'sharing-unavailable') {
          toast.warning('Sharing unavailable', 'Sharing is not available on this device.');
        } else {
          toast.error('Could not share', 'Something went wrong. Please try again.');
        }
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, noun, selectedItems, suppressBackgroundLock]);

  const releaseSelected = useCallback(() => {
    if (busy || selectedItems.length === 0) return;
    void (async () => {
      const knownOriginal = selectedItems.filter(vaultItemHasOriginalLocation).length;
      const target = await pickRestorePlace({
        title:
          selectedItems.length === 1
            ? 'Move to gallery'
            : `Move ${selectedItems.length} ${plural} to gallery`,
        message: 'Choose where these files should go, then they will be removed from the vault.',
        originalHint:
          knownOriginal === selectedItems.length
            ? 'Back to the same album they were imported from.'
            : knownOriginal > 0
              ? `${knownOriginal} can go to their original album. The rest go to the default gallery.`
              : 'Original album wasn’t saved for these items. They’ll go to the default gallery.',
        folderDefault: DEFAULT_RESTORE_FOLDER,
      });
      if (!target) return;
      setBusy(true);
      const releaseExternalFlow = suppressBackgroundLock(120_000);
      try {
        const result = await releaseVaultItemsToGallery(selectedItems, target);
        if (result.permissionDenied) {
          toast.warning(
            'Could not move',
            'Allow library access so AR Vault can add these files back to your gallery.'
          );
          return;
        }
        if (noun === 'video') {
          for (const id of result.releasedIds) {
            clearVaultVideoThumb(id);
          }
        }
        await refresh();
        if (result.released > 0) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        if (result.released > 0 && result.failed === 0) {
          const place =
            target.mode === 'folder'
              ? `Saved in “${target.folderName.trim() || DEFAULT_RESTORE_FOLDER}”.`
              : result.released === 1
                ? `That ${noun} is back in your gallery.`
                : `${result.released} ${noun}s are back in your gallery.`;
          toast.success('Moved to gallery', place);
          exitSelection();
        } else if (result.released > 0) {
          toast.warning(
            'Partially moved',
            `${result.released} moved. ${result.failed} could not be copied to gallery.`
          );
          exitSelection();
        } else {
          toast.error('Could not move', 'Nothing was copied to your gallery.');
        }
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (code === 'gallery-copied-vault-delete-failed') {
          toast.error(
            'Partially done',
            'Copies were added to your gallery, but some vault files could not be removed.'
          );
          await refresh();
          exitSelection();
        } else {
          toast.error('Could not move', 'Something went wrong. Please try again.');
        }
      } finally {
        releaseExternalFlow();
        setBusy(false);
      }
    })();
  }, [busy, exitSelection, noun, plural, refresh, selectedItems, suppressBackgroundLock]);

  return { busy, shareSelected, releaseSelected };
}

export type VaultSelectionHandlers = {
  selecting: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (item: VaultItem) => void;
  onEnterSelection: (item: VaultItem) => void;
};
