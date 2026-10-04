import { useEffect, useState } from 'react';

import { getPlainUri } from '@/lib/crypto/viewCache';
import type { VaultItem } from '@/types/vault';

/** Decrypts a vault item into the view cache and returns its local URI once ready. */
export function useVaultFileUri(item: VaultItem | null) {
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    setError(null);
    if (!item) return;
    getPlainUri(item).then(
      (u) => !cancelled && setUri(u),
      (e) => !cancelled && setError(e instanceof Error ? e.message : String(e))
    );
    return () => {
      cancelled = true;
    };
  }, [item]);

  return { uri, error };
}
