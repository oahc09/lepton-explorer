import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// ---- Color coding (migrated from the old tagStore 7-color scheme) ----
export type TagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

export const TAG_COLORS: { key: TagColor; label: string; hex: string }[] = [
  { key: 'red', label: '红色', hex: '#e81123' },
  { key: 'orange', label: '橙色', hex: '#f7630c' },
  { key: 'yellow', label: '黄色', hex: '#ffb900' },
  { key: 'green', label: '绿色', hex: '#107c10' },
  { key: 'blue', label: '蓝色', hex: '#0078d4' },
  { key: 'purple', label: '紫色', hex: '#7b3fbf' },
  { key: 'gray', label: '灰色', hex: '#737373' },
];

export const TAG_HEX: Record<TagColor, string> = TAG_COLORS.reduce(
  (acc, t) => { acc[t.key] = t.hex; return acc; },
  {} as Record<TagColor, string>,
);

// ---- Status icons ----
export const STATUS_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'todo', label: '待办', icon: '📝' },
  { key: 'in-progress', label: '进行中', icon: '🔄' },
  { key: 'done', label: '完成', icon: '✅' },
  { key: 'important', label: '重要', icon: '⭐' },
  { key: 'favorite', label: '收藏', icon: '❤️' },
];

export const STATUS_ICON: Record<string, string> = STATUS_OPTIONS.reduce(
  (acc, s) => { acc[s.key] = s.icon; return acc; },
  {} as Record<string, string>,
);

// ---- Metadata shape (mirrors the Rust FileMeta) ----
export interface FileMeta {
  color: string | null;
  status: string | null;
  rating: number;
  tags: string[];
  description: string;
}

const EMPTY_META: FileMeta = { color: null, status: null, rating: 0, tags: [], description: '' };

function isEmpty(m: FileMeta): boolean {
  return !m.color && !m.status && m.rating === 0 && m.tags.length === 0 && !m.description;
}

interface MetadataState {
  cache: Record<string, FileMeta>;
  /** Warm the cache for a set of paths (already-cached paths are skipped). */
  ensure: (paths: string[]) => Promise<void>;
  /** Merge a patch into a path's metadata and persist to the backend. */
  update: (path: string, patch: Partial<FileMeta>) => void;
  setColor: (path: string, color: TagColor | null) => void;
  setStatus: (path: string, status: string | null) => void;
  setRating: (path: string, rating: number) => void;
  setTags: (path: string, tags: string[]) => void;
  setDescription: (path: string, description: string) => void;
}

export const useMetadataStore = create<MetadataState>((set, get) => ({
  cache: {},

  ensure: async (paths) => {
    const cache = get().cache;
    const missing = paths.filter((p) => p && !(p in cache));
    if (!missing.length) return;
    const loaded = await invoke<Record<string, FileMeta>>('list_file_meta', { paths: missing })
      .catch(() => ({} as Record<string, FileMeta>));
    if (Object.keys(loaded).length) {
      set((s) => ({ cache: { ...s.cache, ...loaded } }));
    }
  },

  update: (path, patch) => {
    const prev = get().cache[path] ?? EMPTY_META;
    const next = { ...prev, ...patch };
    set((s) => {
      const cache = { ...s.cache };
      if (isEmpty(next)) delete cache[path];
      else cache[path] = next;
      return { cache };
    });
    void invoke('set_file_meta', { path, meta: next }).catch(() => {});
  },

  setColor: (path, color) => get().update(path, { color }),
  setStatus: (path, status) => get().update(path, { status }),
  setRating: (path, rating) => get().update(path, { rating }),
  setTags: (path, tags) => get().update(path, { tags }),
  setDescription: (path, description) => get().update(path, { description }),
}));

/**
 * One-time migration from the legacy localStorage color-tag store to the
 * backend metadata store. Safe to call on every startup (it clears the source
 * key after migrating).
 */
export async function migrateLegacyTags(): Promise<void> {
  try {
    const raw = localStorage.getItem('lepton-tags');
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: { tags?: Record<string, TagColor> } };
    const tags = parsed?.state?.tags ?? {};
    const entries = Object.entries(tags);
    if (!entries.length) return;
    for (const [path, color] of entries) {
      await invoke('set_file_meta', {
        path,
        meta: { color, status: null, rating: 0, tags: [], description: '' },
      }).catch(() => {});
    }
    localStorage.removeItem('lepton-tags');
  } catch {
    /* ignore malformed legacy data */
  }
}
