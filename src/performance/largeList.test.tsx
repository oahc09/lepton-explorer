/**
 * Performance tests for large file lists.
 *
 * Run with:
 *   npx vitest run src/performance --reporter=verbose
 *
 * These tests measure render time for large datasets (1000+ entries)
 * and print timing information to stdout.
 */
import { describe, test } from 'vitest';
import { render } from '@testing-library/react';
import type { Entry } from '../types';
import { DetailsView } from '../components/views/DetailsView';
import { IconsView } from '../components/views/IconsView';
import { ListView } from '../components/views/ListView';
import { TilesView } from '../components/views/TilesView';

// ─── helpers ─────────────────────────────────────────────

/** Generate `n` mock entries with realistic-looking data. */
function makeEntries(n: number): Entry[] {
  const exts = ['txt', 'png', 'jpg', 'pdf', 'docx', 'xlsx', 'mp3', 'mp4', 'exe', 'zip'];
  const dirs = ['Documents', 'Pictures', 'Videos', 'Music', 'Downloads'];
  const out: Entry[] = [];
  for (let i = 0; i < n; i++) {
    const isDir = i % 7 === 0;
    const name = isDir
      ? dirs[i % dirs.length]!
      : `file_${String(i).padStart(6, '0')}.${exts[i % exts.length]!}`;
    out.push({
      name,
      path: `C:\\test\\${name}`,
      isDir,
      size: isDir ? 0 : Math.floor(Math.random() * 1_000_000),
      modified: 1704067200000,
      created: 1704067200000,
      accessed: 1704067200000,
      typeLabel: isDir ? '文件夹' : `${exts[i % exts.length]} 文件`,
      ext: isDir ? '' : exts[i % exts.length]!,
      isHidden: false,
      isSystem: false,
      isReadOnly: false,
    });
  }
  return out;
}

// ─── tests ───────────────────────────────────────────────

describe('performance: large file lists', () => {
  const SIZES = [100, 500, 1000, 2000];

  for (const size of SIZES) {
    test(`DetailsView renders ${size} entries`, () => {
      const entries = makeEntries(size);
      const t0 = performance.now();
      const r = render(<DetailsView entries={entries} />);
      r.container.querySelectorAll('.details-row');
      const t1 = performance.now();
      r.unmount();
      printPerf('DetailsView', size, t0, t1);
    });

    test(`IconsView renders ${size} entries`, () => {
      const entries = makeEntries(size);
      const t0 = performance.now();
      const r = render(<IconsView entries={entries} />);
      r.container.querySelectorAll('.tile');
      const t1 = performance.now();
      r.unmount();
      printPerf('IconsView', size, t0, t1);
    });

    test(`ListView renders ${size} entries`, () => {
      const entries = makeEntries(size);
      const t0 = performance.now();
      const r = render(<ListView entries={entries} />);
      r.container.querySelectorAll('.list-item');
      const t1 = performance.now();
      r.unmount();
      printPerf('ListView', size, t0, t1);
    });

    test(`TilesView renders ${size} entries`, () => {
      const entries = makeEntries(size);
      const t0 = performance.now();
      const r = render(<TilesView entries={entries} />);
      r.container.querySelectorAll('.tile2');
      const t1 = performance.now();
      r.unmount();
      printPerf('TilesView', size, t0, t1);
    });
  }
});

// ─── helpers ─────────────────────────────────────────────

function printPerf(view: string, count: number, t0: number, t1: number) {
  const ms = (t1 - t0).toFixed(1);
  const perEntry = (((t1 - t0) / count) * 1000).toFixed(2);
  // eslint-disable-next-line no-console
  console.log(
    `[perf] ${view} × ${count} entries: ${ms} ms  (${perEntry} µs/entry)`,
  );
}
