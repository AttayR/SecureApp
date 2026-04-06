import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { loadItems } from '@/lib/vaultStore';
import type { VaultCategory } from '@/types/vault';

export type VaultStats = Record<VaultCategory, number> & { total: number };

const empty: VaultStats = { photo: 0, audio: 0, video: 0, document: 0, total: 0 };

export function useVaultStats() {
  const [stats, setStats] = useState<VaultStats>(empty);

  const refresh = useCallback(async () => {
    const items = await loadItems();
    const next: VaultStats = { ...empty, total: items.length };
    for (const i of items) {
      next[i.category]++;
    }
    setStats(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return { stats, refresh };
}
