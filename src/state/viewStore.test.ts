import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from './viewStore';
import type { FolderView } from '../types';

beforeEach(() => useViewStore.setState({ viewMode: 'details', sort: { field: 'name', asc: true }, colWidths: { name: 600, date: 180, type: 160, size: 110 }, colVisible: { name: true, date: true, type: true, size: true }, showHidden: false, showExtensions: false, previewPane: false, detailsPane: false }));

describe('viewStore', () => {
  it('setViewMode updates mode', () => {
    useViewStore.getState().setViewMode('large');
    expect(useViewStore.getState().viewMode).toBe('large');
  });
  it('toggle sort flips asc when same field', () => {
    useViewStore.getState().sort = { field: 'name', asc: true };
    useViewStore.getState().setSort('name');
    expect(useViewStore.getState().sort).toEqual({ field: 'name', asc: false });
  });
  it('sort by new field defaults ascending', () => {
    useViewStore.getState().sort = { field: 'name', asc: false };
    useViewStore.getState().setSort('size');
    expect(useViewStore.getState().sort).toEqual({ field: 'size', asc: true });
  });
  it('setColWidth updates the width and clamps to min 40', () => {
    useViewStore.getState().setColWidth('date', 250);
    expect(useViewStore.getState().colWidths.date).toBe(250);
    useViewStore.getState().setColWidth('size', 10);
    expect(useViewStore.getState().colWidths.size).toBe(40);
  });
  it('toggleCol hides/shows a column but never Name', () => {
    useViewStore.getState().toggleCol('date');
    expect(useViewStore.getState().colVisible.date).toBe(false);
    useViewStore.getState().toggleCol('date');
    expect(useViewStore.getState().colVisible.date).toBe(true);
    // Name is always visible (toggleCol is a no-op for it).
    useViewStore.getState().toggleCol('name');
    expect(useViewStore.getState().colVisible.name).toBe(true);
  });
  it('toggleHidden flips the flag', () => {
    expect(useViewStore.getState().showHidden).toBe(false);
    useViewStore.getState().toggleHidden();
    expect(useViewStore.getState().showHidden).toBe(true);
    useViewStore.getState().toggleHidden();
    expect(useViewStore.getState().showHidden).toBe(false);
  });
  it('togglePreview clears detailsPane and vice versa', () => {
    useViewStore.setState({ previewPane: false, detailsPane: true });
    useViewStore.getState().togglePreview();
    expect(useViewStore.getState().previewPane).toBe(true);
    expect(useViewStore.getState().detailsPane).toBe(false);
    useViewStore.getState().toggleDetails();
    expect(useViewStore.getState().detailsPane).toBe(true);
    expect(useViewStore.getState().previewPane).toBe(false);
  });
});

describe('viewStore.applyFolderOverrides', () => {
  const sample: FolderView = {
    viewMode: 'tiles',
    sortField: 'modified',
    sortAsc: false,
    colWidths: { name: 320, date: 170, type: 150, size: 120 },
  };

  it('applies view mode, sort and column widths from a FolderView', () => {
    useViewStore.getState().applyFolderOverrides(sample);
    const s = useViewStore.getState();
    expect(s.viewMode).toBe('tiles');
    expect(s.sort).toEqual({ field: 'modified', asc: false });
    expect(s.colWidths.type).toBe(150);
    expect(s.colWidths.size).toBe(120);
  });

  it('does not mutate unrelated state (e.g. navPaneWidth, themeMode)', () => {
    const before = useViewStore.getState().navPaneWidth;
    useViewStore.getState().applyFolderOverrides(sample);
    expect(useViewStore.getState().navPaneWidth).toBe(before);
  });
});
