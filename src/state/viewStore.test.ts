import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from './viewStore';

beforeEach(() => useViewStore.setState({ viewMode: 'details', sort: { field: 'name', asc: true }, colWidths: { name: 600, date: 180, type: 160, size: 110 }, showHidden: false, showExtensions: false, previewPane: false, detailsPane: false }));

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
