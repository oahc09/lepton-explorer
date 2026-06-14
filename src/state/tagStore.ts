import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface TagState {
  tags: Record<string, TagColor>;
  setTag: (path: string, color: TagColor) => void;
  clearTag: (path: string) => void;
}

/** Persisted per-path color tags (files/folders). */
export const useTagStore = create<TagState>()(
  persist(
    (set) => ({
      tags: {},
      setTag: (path, color) => set((s) => ({ tags: { ...s.tags, [path]: color } })),
      clearTag: (path) =>
        set((s) => {
          const { [path]: _omit, ...rest } = s.tags;
          return { tags: rest };
        }),
    }),
    { name: 'winfinder-tags' },
  ),
);
