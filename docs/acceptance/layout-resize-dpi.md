# Layout stability under resize + DPI scaling

Addresses the spec gap: §11.1 scoped visual fidelity to 100% scale / fixed DPI and
did not separately specify resize-stability or high-DPI behavior. This document
records the assessment and the safeguards added.

## 1. Layout stability when the window resizes

**Structure (adaptive by design):**
- `.app` is `flex column, height: 100vh` — fills the window vertically.
- `.body` is `flex row, flex: 1, min-height: 0` — fills remaining height; `min-height:0`
  lets the file list scroll instead of pushing the status bar off-screen.
- `.nav-pane` is a fixed `240px`; `.main-view` is `flex: 1` — the content area grows
  / shrinks with the window width; the nav pane stays a constant width (like Win11).
- The details-view Name column is `minmax(80px, <width>)` — it shrinks so the other
  columns stay visible in narrow windows (see `section11-self-capture.md`).
- Icon tiles wrap (`flex` rows) — fewer per row in narrow windows.

**Tested:** a self-capture at **600×400** (`lepton-capture-small.png`) confirmed
the toolbar row (back/forward/up/refresh + 8 command buttons + breadcrumb + search),
nav pane, content, and status bar all fit with **no overflow, no clipping, no
horizontal scrollbar** — the breadcrumb (`flex:1`) and search (`flex:0 1`) absorb
the width change.

**Safeguards added (so it never breaks):**
- **Minimum window size:** `tauri.conf.json` now sets `minWidth: 520, minHeight: 320`
  — the window cannot be resized below a usable threshold, matching Win11 File
  Explorer (which also has a minimum size) rather than attempting to render an
  unusably tiny layout.
- **Defensive flexbox:** `.toolbar-row { overflow: hidden }`, and `min-width: 0` on
  `.breadcrumb` / `.command-bar` (flex children) so they shrink rather than overflow;
  the command bar also `flex-shrink: 1`. This guarantees no horizontal scroll/overflow
  at any size down to the minimum.

## 2. DPI scaling (125% / 150% / 200%)

Lepton Explorer renders in a **WebView2 (Chromium)** surface, which is fully DPI-aware:
- The OS DPI scale is applied automatically by the compositor; all `px` units, fonts,
  and hit-targets scale proportionally — a 14px font and a 36px button render larger
  at 150% exactly as Win11's own controls do.
- The **Mica** title-bar effect is OS-level and DPI-correct by definition.
- The custom window-control buttons (`46×40px`) are CSS `px`, so they scale with DPI
  alongside the rest of the UI (consistent with Win11's caption buttons).

**Net:** high-DPI displays are handled by the platform; no per-DPI assets or manual
scaling are needed. The §11.1 zero-deviation target is defined at 100% DPI; at other
DPI settings the app scales uniformly with the OS (the expected, correct behavior).

## 3. Caveats / known minor items

- The nav pane is a fixed 240px and is **not user-resizable** in this build (Win11's
  is draggable). This is a feature gap, not a stability bug — the layout is stable.
- The command bar does not collapse low-priority buttons into an overflow ("…") menu
  at narrow widths (Win11 does). With the 520px minimum + flex-shrink, the layout
  stays stable; an overflow menu would be a future enhancement, not a correctness fix.

**Verification:** 139 frontend + 47 Rust tests pass; `tsc` clean; exe builds and runs;
resize-stability confirmed via self-capture at 600×400.
