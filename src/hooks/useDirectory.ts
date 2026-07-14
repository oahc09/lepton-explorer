import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Entry } from '../types';
import { isVirtualPath } from '../types';

export function useDirectory(path: string, refreshKey?: unknown) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const call = isVirtualPath(path)
      ? invoke<Entry[]>(path === 'gallery:' ? 'list_gallery' : 'list_network')
      : invoke<Entry[]>('list_directory', { dir: path });
    call
      .then((e) => { if (!cancelled) setEntries(e); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, refreshKey]);

  return { entries, loading, error };
}
