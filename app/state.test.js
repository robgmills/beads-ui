import { describe, expect, test } from 'vitest';
import { createStore } from './state.js';

describe('state store', () => {
  test('get/set/subscribe works and dedupes unchanged', () => {
    const store = createStore();
    const seen = [];
    const off = store.subscribe((s) => seen.push(s));

    store.setState({ selected_id: 'UI-1' });
    store.setState({ filters: { status: 'open' } });
    // no-op (unchanged)
    store.setState({ filters: { status: 'open' } });
    off();

    expect(seen.length).toBe(2);
    const state = store.getState();
    expect(state.selected_id).toBe('UI-1');
    expect(state.filters.status).toBe('open');
  });

  test('defaults closed filter to today', () => {
    const store = createStore();

    const state = store.getState();

    expect(state.board.closed_filter).toBe('today');
  });

  test('updates closed filter and normalizes invalid values', () => {
    const store = createStore({ board: { closed_filter: '7' } });
    const seen = [];
    const off = store.subscribe((s) => seen.push(s));

    store.setState({ board: { closed_filter: '3' } });
    store.setState({ board: { closed_filter: '3' } });
    store.setState({ board: { closed_filter: /** @type {any} */ ('bad') } });
    off();

    expect(seen.length).toBe(2);
    expect(store.getState().board.closed_filter).toBe('today');
  });
});
