import { invoke } from '@tauri-apps/api/core';
import { useClipboardStore } from '../state/clipboardStore';
import { useConflictStore } from '../state/conflictStore';
import { useConfirmStore } from '../state/confirmStore';
import { useHistoryStore } from '../state/historyStore';
import { parentOf } from '../state/locationStore';
import { useProgressStore } from '../state/progressStore';
import { joinPath } from '../utils/paths';
import type { ConflictInfo, ConflictStrategy } from '../types';

function refresh() {
  // App listens for this and bumps its refreshKey to re-list.
  window.dispatchEvent(new CustomEvent('lepton:refresh'));
}

/** Result returned by copy_with_progress / move_with_progress. */
interface TrackedCopyResult { paths: string[]; trashed: string[]; }
interface TrackedMoveResult { pairs: [string, string][]; trashed: string[]; }

export function useFileOps() {
  const push = useHistoryStore((s) => s.push);

  async function newFolder(dir: string) {
    // Resolve a non-colliding name ("新建文件夹 (2)"…) so it never errors on duplicate.
    const path = await invoke<string>('unique_target', { dir, name: '新建文件夹' });
    await invoke('create_dir', { path });
    push({
      label: '新建文件夹',
      undo: async () => { await invoke('delete_to_trash', { paths: [path] }); refresh(); },
      redo: async () => { await invoke('create_dir', { path }); refresh(); },
    });
    refresh();
    return path;
  }

  async function newFile(dir: string) {
    const path = await invoke<string>('unique_target', { dir, name: '新建文本文档.txt' });
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
      useProgressStore.getState().open('copy');
      try {
        const result = await invoke<TrackedCopyResult>('copy_with_progress', { sources, dest: destDir, strategy });
        const created = result.paths;
        // Mutable ref so redo can update the trashed paths for the next undo.
        const trashedRef = { current: result.trashed };
        push({
          label: '复制',
          undo: async () => {
            // Remove the pasted files first (so restore doesn't collide).
            await invoke('delete_to_trash', { paths: created });
            // Restore any files that were trashed during Replace.
            if (trashedRef.current.length) {
              await invoke('restore_from_trash', { paths: trashedRef.current });
            }
            refresh();
          },
          redo: async () => {
            useProgressStore.getState().open('copy');
            try {
              const r = await invoke<TrackedCopyResult>('copy_with_progress', { sources, dest: destDir, strategy });
              // Update trashed paths so the next undo restores the right files.
              trashedRef.current = r.trashed;
            } finally { useProgressStore.getState().close(); }
            refresh();
          },
        });
      } finally {
        useProgressStore.getState().close();
      }
    } else {
      useProgressStore.getState().open('move');
      try {
        const result = await invoke<TrackedMoveResult>('move_with_progress', { sources, dest: destDir, strategy });
        const pairs = result.pairs;
        const trashedRef = { current: result.trashed };
        push({
          label: '移动',
          undo: async () => {
            for (const [oldP, newP] of pairs) {
              await invoke('move_items', { sources: [newP], dest: parentOf(oldP) });
            }
            // Restore files trashed during Replace.
            if (trashedRef.current.length) {
              await invoke('restore_from_trash', { paths: trashedRef.current });
            }
            refresh();
          },
          redo: async () => {
            const olds = pairs.map((p2) => p2[0]);
            useProgressStore.getState().open('move');
            try {
              const r = await invoke<TrackedMoveResult>('move_with_progress', { sources: olds, dest: destDir, strategy });
              trashedRef.current = r.trashed;
            } finally { useProgressStore.getState().close(); }
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
    if (!paths.length) return;
    // Ask for explicit confirmation before any destructive delete. Both the
    // recycle-bin (soft) and permanent (Shift+Delete) paths require it.
    const names = paths.map((p) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p);
    const count = paths.length;
    const ok = await useConfirmStore.getState().ask({
      title: permanent ? '永久删除' : '删除文件',
      message: permanent
        ? `确定要永久删除这${count > 1 ? ` ${count} 个项目` : '个项目'}吗？此操作无法撤销。`
        : `确定要将这${count > 1 ? ` ${count} 个项目` : '个项目'}移动到回收站吗？`,
      names: count <= 8 ? names : undefined,
      confirmLabel: permanent ? '永久删除' : '删除',
      danger: true,
    });
    if (!ok) return;
    if (permanent) {
      await invoke('delete_permanent', { paths });
      // Permanent delete is not undoable.
    } else {
      // Undoable delete: record original paths, push a history entry that
      // restores from recycle bin on undo and re-deletes on redo.
      const originalPaths = await invoke<string[]>('delete_to_trash_undoable', { paths });
      if (originalPaths.length) {
        const pathsRef = { current: originalPaths };
        push({
          label: '删除',
          undo: async () => {
            await invoke('restore_from_trash', { paths: pathsRef.current });
            refresh();
          },
          redo: async () => {
            pathsRef.current = await invoke<string[]>('delete_to_trash_undoable', { paths: pathsRef.current });
            refresh();
          },
        });
      }
    }
    refresh();
  }

  /** Create a typed file (txt/docx/xlsx/…) with a non-colliding name. Undoable. */
  async function newTypedFile(dir: string, label: string, ext: string) {
    const name = `新建 ${label}.${ext}`;
    const path = await invoke<string>('unique_target', { dir, name });
    await invoke('create_typed_file', { path });
    push({
      label: `新建${label}`,
      undo: async () => { await invoke('delete_to_trash', { paths: [path] }); refresh(); },
      redo: async () => { await invoke('create_typed_file', { path }); refresh(); },
    });
    refresh();
  }

  /** Copy a path string to the system clipboard. */
  function copyPath(path: string) {
    navigator.clipboard?.writeText(path).catch(() => {});
  }

  /** Open a terminal (Windows Terminal, else cmd) at the given folder. */
  async function openTerminal(path: string) {
    try { await invoke('open_in_terminal', { path }); } catch { /* ignore */ }
  }

  /** Compress `sources` into a single .zip placed in `destDir`. Undoable-free
   * (the archive is a new file); shows a progress dialog while compressing. */
  async function zip(sources: string[], destDir: string) {
    if (!sources.length) return;
    // Archive name derives from the first selected item (Explorer behavior).
    const first = sources[0].replace(/[\\/]+$/, '');
    const base = first.split(/[\\/]/).pop() || 'Archive';
    const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
    const destZip = await invoke<string>('unique_target', { dir: destDir, name: `${stem}.zip` });
    useProgressStore.getState().open('compress');
    try {
      await invoke('create_archive', { sources, dest_zip: destZip });
    } finally {
      useProgressStore.getState().close();
    }
    refresh();
  }

  /** Extract the .zip at `zipPath` into a sibling folder (auto-suffixed on
   * collision) under `destDir`. Shows a progress dialog while extracting. */
  async function unzip(zipPath: string, destDir: string) {
    const name = zipPath.split(/[\\/]/).pop() || 'Archive';
    const stem = name.toLowerCase().endsWith('.zip') ? name.slice(0, -4) : name;
    const dest = await invoke<string>('unique_target', { dir: destDir, name: stem });
    await invoke('create_dir', { path: dest });
    useProgressStore.getState().open('extract');
    try {
      await invoke('extract_archive', { zip_path: zipPath, dest_dir: dest });
    } finally {
      useProgressStore.getState().close();
    }
    refresh();
  }

  return { newFolder, newFile, newTypedFile, renameEntry, paste, remove, copyPath, openTerminal, zip, unzip };
}
