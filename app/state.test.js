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

  test('defaults graph closed issues to visible', () => {
    const store = createStore();

    const state = store.getState();

    expect(state.graph.show_closed).toBe(true);
  });

  test('updates graph closed issues visibility', () => {
    const store = createStore({ graph: { show_closed: true } });
    const seen = [];
    const off = store.subscribe((s) => seen.push(s));

    store.setState({ graph: { show_closed: false } });
    store.setState({ graph: { show_closed: false } });
    off();

    expect(seen.length).toBe(1);
    expect(store.getState().graph.show_closed).toBe(false);
  });
});
