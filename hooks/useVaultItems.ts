import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { loadItems } from '@/lib/vaultStore';
import type { VaultCategory, VaultItem } from '@/types/vault';

export function useVaultItems(category: VaultCategory) {
  const [items, setItems] = useState<VaultItem[]>([]);

  const refresh = useCallback(async () => {
    const all = await loadItems();
    setItems(all.filter((i) => i.category === category));
  }, [category]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return { items, refresh };
}
