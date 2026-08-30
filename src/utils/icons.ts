/**
 * Segoe Fluent Icons (the icon font Windows 11 ships with).
 *
 * Rendering these as text keeps the app dependency-free and pixel-identical to
 * native File Explorer on Windows 11. Every glyph below is a Unicode code point
 * from the Segoe Fluent Icons private-use area (E700–E9FF), verified against
 * Microsoft's iconography reference.
 *
 * Any element that renders one of these must carry the `fi` class so it picks up
 * the icon font-family (see `.fi` in win11.css); otherwise the browser falls back
 * to a regular font and the glyph shows as a missing-character box.
 */

// Navigation
export const ICON_HOME = '\uE80F';
export const ICON_FOLDER = '\uE8B7';
export const ICON_FOLDER_OPEN = '\uE838';
export const ICON_NEW_FOLDER = '\uE8F4';
export const ICON_CLOUD = '\uE753';
export const ICON_PICTURE = '\uE8B9';
export const ICON_GLOBE = '\uE774';
export const ICON_NETWORK = '\uE968';
export const ICON_USB = '\uE88E';
export const ICON_STORAGE_OPTICAL = '\uE958';
export const ICON_THIS_PC = '\uE977';
export const ICON_LAPTOP = '\uE7F7';

// Special folders
export const ICON_DESKTOP = '\uE7F4';
export const ICON_DOCUMENT = '\uE8A5';
export const ICON_DOWNLOAD = '\uE896';
export const ICON_MUSIC = '\uE8D6';
export const ICON_VIDEO = '\uE714';

// Favorites / organization
export const ICON_STAR = '\uE734';
export const ICON_STAR_FILL = '\uE735';
export const ICON_PIN = '\uE718';
export const ICON_PINNED = '\uE840';

// Toolbar / navigation controls
export const ICON_BACK = '\uE72B';
export const ICON_FORWARD = '\uE72A';
export const ICON_UP = '\uE74A';
export const ICON_REFRESH = '\uE72C';
export const ICON_SEARCH = '\uE721';
export const ICON_SETTINGS = '\uE713';

// Edit operations
export const ICON_COPY = '\uE8C8';
export const ICON_CUT = '\uE8C6';
export const ICON_PASTE = '\uE77F';
export const ICON_DELETE = '\uE74D';
export const ICON_RENAME = '\uE8AC';
export const ICON_ADD = '\uE710';
export const ICON_CANCEL = '\uE711';

// View / sort
export const ICON_VIEW = '\uE890';
export const ICON_SORT = '\uE8CB';
export const ICON_INFO = '\uE946';
export const ICON_CHECK_MARK = '\uE73E';

// Window controls
export const ICON_MINIMIZE = '\uE921';
export const ICON_MAXIMIZE = '\uE922';
export const ICON_RESTORE = '\uE923';
export const ICON_CLOSE = '\uE8BB';

/** Caret glyphs for expandable tree nodes. */
export const ICON_CHEVRON_DOWN = '\uE70D';
export const ICON_CHEVRON_UP = '\uE70E';
export const ICON_CHEVRON_RIGHT = '\uE76C';

/** Map a special-folder key from the backend to its Fluent glyph. */
export function iconForFolderKey(key: string): string {
  switch (key) {
    case 'desktop':
      return ICON_DESKTOP;
    case 'documents':
      return ICON_DOCUMENT;
    case 'downloads':
      return ICON_DOWNLOAD;
    case 'pictures':
      return ICON_PICTURE;
    case 'music':
      return ICON_MUSIC;
    case 'videos':
      return ICON_VIDEO;
    default:
      return ICON_FOLDER;
  }
}
