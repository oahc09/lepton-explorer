export interface Entry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
  created: number;
  accessed: number;
  typeLabel: string;
  ext: string;
  isHidden: boolean;
  isSystem: boolean;
  isReadOnly: boolean;
}

export type ViewMode =
  | 'extra-large' | 'large' | 'medium' | 'small'
  | 'list' | 'details' | 'tiles' | 'content';

export type IconSize = 'extra-large' | 'large' | 'medium' | 'small';
export const ICON_MODES: IconSize[] = ['extra-large', 'large', 'medium', 'small'];

export type SortField = 'name' | 'modified' | 'type' | 'size';
export interface Sort { field: SortField; asc: boolean; }

/** Quick-new-file types (label shown in the menu + file extension). */
export const NEW_FILE_KINDS: { label: string; ext: string }[] = [
  { label: '文本文档', ext: 'txt' },
  { label: 'Word 文档', ext: 'docx' },
  { label: 'Excel 工作表', ext: 'xlsx' },
  { label: 'PowerPoint 演示文稿', ext: 'pptx' },
  { label: '富文本文档', ext: 'rtf' },
  { label: 'Markdown', ext: 'md' },
  { label: 'CSV 表格', ext: 'csv' },
  { label: 'JSON', ext: 'json' },
  { label: 'HTML 网页', ext: 'html' },
];

export interface SpecialFolder { key: string; name: string; path: string; }
export interface Drive { letter: string; path: string; }
export interface DriveInfo { letter: string; path: string; label: string; total: number; free: number; used: number; kind: string; }

/// How a copy/move collision is resolved (mirrors the Rust ConflictStrategy).
/// - 'rename'  → keep both (auto-rename incoming "name (1)")
/// - 'replace' → overwrite the existing item
/// - 'skip'    → leave the existing item untouched
export type ConflictStrategy = 'rename' | 'replace' | 'skip';
export interface ConflictInfo { name: string; }

/** Address-bar autocomplete suggestion (mirrors Rust PathSuggestion). */
export interface PathSuggestion { name: string; path: string; isDir: boolean; }

/** Per-folder view settings persisted on the backend (mirrors Rust FolderView). */
export interface FolderView {
  viewMode: ViewMode;
  sortField: SortField;
  sortAsc: boolean;
  colWidths: { name: number; date: number; type: number; size: number };
}

/** Virtual (non-filesystem) navigation roots surfaced by the NavPane. */
export const NETWORK_ROOT = 'network:';
export const GALLERY_ROOT = 'gallery:';
export const THISPC_ROOT = 'thispc:';
export const isVirtualPath = (p: string) => p === NETWORK_ROOT || p === GALLERY_ROOT || p === THISPC_ROOT;
