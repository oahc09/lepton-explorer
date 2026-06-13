import { invoke } from '@tauri-apps/api/core';
import { useClipboardStore } from '../state/clipboardStore';
import { useConflictStore } from '../state/conflictStore';
import { useHistoryStore } from '../state/historyStore';
import { parentOf } from '../state/locationStore';
import { useProgressStore } from '../state/progressStore';
import { joinPath } from '../utils/paths';
import type { ConflictInfo, ConflictStrategy } from '../types';

function refresh() {
  // App listens for this and bumps its refreshKey to re-list.
  window.dispatchEvent(new CustomEvent('winfinder:refresh'));
}

export function useFileOps() {
  const push = useHistoryStore((s) => s.push);

  async function newFolder(dir: string) {
    const path = joinPath(dir, '新建文件夹');
    const created = await invoke('create_dir', { path });
    push({
      label: '新建文件夹',
      undo: async () => { await invoke('delete_to_trash', { paths: [path] }); refresh(); },
      redo: async () => { await invoke('create_dir', { path }); refresh(); },
    });
    refresh();
    return created;
  }

  async function newFile(dir: string) {
    const path = joinPath(dir, '新建文本文档.txt');
    await invoke('create_file', { path });
    push({
      label: '新建文件',
      undo: async () => { await invoke('delete_to_trash', { paths: [path] }); refresh(); },
      redo: async () => { await invoke('create_file', { path }); refresh(); },
    });
    refresh();
  }

  async function renameEntry(from: string, toName: string) {
    const parent = parentOf(from);
    const to = joinPath(parent, toName);
    await invoke('rename', { from, to });
    push({
      label: '重命名',
      undo: async () => { await invoke('rename', { from: to, to: from }); refresh(); },
      redo: async () => { await invoke('rename', { from, to }); refresh(); },
    });
    refresh();
  }

  async function paste(destDir: string) {
    const { items, mode } = useClipboardStore.getState();
    if (!items.length) return;
    const sources = items.map((i) => i.path);

    // Detect collisions; if any, ask the user how to resolve them (Win11
    // "替换或跳过文件" dialog). `null` means the user cancelled the paste.
    const conflicts = await invoke<ConflictInfo[]>('check_conflicts', { sources, dest: destDir });
    let strategy: ConflictStrategy = 'rename';
    if (conflicts.length) {
      const choice = await useConflictStore.getState().ask(conflicts.map((c) => c.name));
      if (choice === null) return;
      strategy = choice;
    }

    if (mode === 'copy') {
      useProgressStore.getState().open();
      try {
        const created = await invoke<string[]>('copy_with_progress', { sources, dest: destDir, strategy });
        push({
          label: '复制',
          undo: async () => { await invoke('delete_to_trash', { paths: created }); refresh(); },
          redo: async () => { await invoke('copy_items_with_strategy', { sources, dest: destDir, strategy }); refresh(); },
        });
      } finally {
        useProgressStore.getState().close();
      }
    } else {
      useProgressStore.getState().open();
      try {
        const moved = await invoke<[string, string][]>('move_with_progress', { sources, dest: destDir, strategy });
        const pairs = moved; // [(old, new), ...] for items actually moved
        push({
          label: '移动',
          undo: async () => {
            for (const [oldP, newP] of pairs) {
              await invoke('move_items', { sources: [newP], dest: parentOf(oldP) });
            }
            refresh();
          },
          redo: async () => {
            const olds = pairs.map((p2) => p2[0]);
            await invoke('move_items_with_strategy', { sources: olds, dest: destDir, strategy });
            refresh();
          },
        });
        useClipboardStore.getState().clear();
      } finally {
        useProgressStore.getState().close();
      }
    }
    refresh();
  }

  async function remove(paths: string[], permanent: boolean) {
    if (permanent) await invoke('delete_permanent', { paths });
    else await invoke('delete_to_trash', { paths });
    // Delete is not undoable in this plan.
    refresh();
  }

  return { newFolder, newFile, renameEntry, paste, remove };
}
