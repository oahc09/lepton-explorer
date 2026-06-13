import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from './viewStore';

beforeEach(() => useViewStore.setState({ viewMode: 'details', sort: { field: 'name', asc: true } }));

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
});
