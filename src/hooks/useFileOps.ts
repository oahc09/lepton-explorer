import { invoke } from '@tauri-apps/api/core';
import { useClipboardStore } from '../state/clipboardStore';
import { useHistoryStore } from '../state/historyStore';
import { useLocationStore } from '../state/locationStore';
import { joinPath } from '../utils/paths';

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
      undo: async () => { await invoke('delete_permanent', { paths: [path] }); refresh(); },
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
      undo: async () => { await invoke('delete_permanent', { paths: [path] }); refresh(); },
      redo: async () => { await invoke('create_file', { path }); refresh(); },
    });
    refresh();
  }

  async function renameEntry(from: string, toName: string) {
    const parent = from.replace(/\\[^\\]*$/, '');
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
    if (mode === 'copy') {
      const created = await invoke<string[]>('copy_items', { sources, dest: destDir });
      push({
        label: '复制',
        undo: async () => { await invoke('delete_permanent', { paths: created }); refresh(); },
        redo: async () => { await invoke('copy_items', { sources, dest: destDir }); refresh(); },
      });
    } else {
      const moved = await invoke<[string, string][]>('move_items', { sources, dest: destDir });
      const olds = moved.map((mm) => mm[0]);
      push({
        label: '移动',
        undo: async () => { await invoke('move_items', { sources: moved.map((mm) => mm[1]), dest: useLocationStore.getState().path }); refresh(); },
        redo: async () => { await invoke('move_items', { sources: olds, dest: destDir }); refresh(); },
      });
      useClipboardStore.getState().clear();
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
