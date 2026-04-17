import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createStore } from '../state.js';
import { buildGraphModel, createGraphView } from './graph.js';

function createTestIssueStores() {
  /** @type {Map<string, any>} */
  const stores = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /**
   * @param {string} id
   * @returns {any}
   */
  function getStore(id) {
    let store = stores.get(id);
    if (!store) {
      store = createSubscriptionIssueStore(id);
      stores.set(id, store);
      store.subscribe(() => {
        for (const fn of Array.from(listeners)) {
          try {
            fn();
          } catch {
            // ignore
          }
        }
      });
    }
    return store;
  }
  return {
    getStore,
    /** @param {string} id */
    snapshotFor(id) {
      return getStore(id).snapshot().slice();
    },
    /** @param {() => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

describe('views/graph', () => {
  test('builds dependency edges from dependency to dependent', () => {
    const model = buildGraphModel([
      {
        id: 'UI-1',
        title: 'First',
        priority: 1,
        dependencies: []
      },
      {
        id: 'UI-2',
        title: 'Second',
        priority: 1,
        dependencies: [
          {
            issue_id: 'UI-2',
            depends_on_id: 'UI-1',
            type: 'blocks'
          }
        ]
      }
    ]);

    expect(model.edges).toEqual([
      {
        id: 'UI-1->UI-2:blocks',
        source: 'UI-1',
        target: 'UI-2',
        type: 'blocks'
      }
    ]);
    const first = model.nodes.find((node) => node.id === 'UI-1');
    const second = model.nodes.find((node) => node.id === 'UI-2');
    expect(first?.x).toBeLessThan(second?.x || 0);
  });

  test('renders empty state when no graph issues exist', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createTestIssueStores();
    const view = createGraphView(mount, () => {}, issueStores);

    await view.load();

    expect(mount.textContent).toContain('No issues found.');
  });

  test('renders nodes and edges from the graph snapshot', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:graph').applyPush({
      type: 'snapshot',
      id: 'tab:graph',
      revision: 1,
      issues: [
        {
          id: 'UI-1',
          title: 'Plan',
          priority: 0,
          status: 'open',
          issue_type: 'feature'
        },
        {
          id: 'UI-2',
          title: 'Build',
          priority: 1,
          status: 'in_progress',
          issue_type: 'task',
          dependencies: [
            {
              issue_id: 'UI-2',
              depends_on_id: 'UI-1',
              type: 'blocks'
            }
          ]
        }
      ]
    });
    const view = createGraphView(mount, () => {}, issueStores);

    await view.load();

    expect(mount.querySelectorAll('.graph-node').length).toBe(2);
    expect(mount.querySelectorAll('.graph-edge').length).toBe(1);
    expect(mount.textContent).toContain('UI-1');
    expect(mount.textContent).toContain('Build');
  });

  test('navigates when activating a node', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:graph').applyPush({
      type: 'snapshot',
      id: 'tab:graph',
      revision: 1,
      issues: [{ id: 'UI-1', title: 'Plan' }]
    });
    /** @type {string[]} */
    const navigations = [];
    const view = createGraphView(
      mount,
      (id) => {
        navigations.push(id);
      },
      issueStores
    );
    await view.load();

    const node = /** @type {Element|null} */ (
      mount.querySelector('.graph-node')
    );
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(navigations).toEqual(['UI-1']);
  });

  test('updates transform when zoom controls are used', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:graph').applyPush({
      type: 'snapshot',
      id: 'tab:graph',
      revision: 1,
      issues: [{ id: 'UI-1', title: 'Plan' }]
    });
    const view = createGraphView(mount, () => {}, issueStores);
    await view.load();
    const before = mount
      .querySelector('.graph-world')
      ?.getAttribute('transform');

    const zoom_in = /** @type {HTMLButtonElement|null} */ (
      Array.from(mount.querySelectorAll('button')).find(
        (button) => button.textContent === 'Zoom in'
      )
    );
    zoom_in?.click();

    const after = mount
      .querySelector('.graph-world')
      ?.getAttribute('transform');
    expect(after).not.toBe(before);
    expect(after).toContain('scale(1.2)');
  });

  test('renders closed issues when graph preference is enabled', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:graph').applyPush({
      type: 'snapshot',
      id: 'tab:graph',
      revision: 1,
      issues: [
        { id: 'UI-1', title: 'Open', status: 'open' },
        { id: 'UI-2', title: 'Closed', status: 'closed' }
      ]
    });
    const store = createStore({ graph: { show_closed: true } });
    const view = createGraphView(mount, () => {}, issueStores, store);

    await view.load();

    expect(mount.querySelectorAll('.graph-node').length).toBe(2);
    expect(mount.textContent).toContain('UI-2');
  });

  test('hides closed issues when graph preference is disabled', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:graph').applyPush({
      type: 'snapshot',
      id: 'tab:graph',
      revision: 1,
      issues: [
        { id: 'UI-1', title: 'Open', status: 'open' },
        { id: 'UI-2', title: 'Closed', status: 'closed' }
      ]
    });
    const store = createStore({ graph: { show_closed: false } });
    const view = createGraphView(mount, () => {}, issueStores, store);

    await view.load();

    expect(mount.querySelectorAll('.graph-node').length).toBe(1);
    expect(mount.textContent).toContain('UI-1');
    expect(mount.textContent).not.toContain('UI-2');
  });

  test('removes edges connected to hidden closed issues', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:graph').applyPush({
      type: 'snapshot',
      id: 'tab:graph',
      revision: 1,
      issues: [
        { id: 'UI-1', title: 'Open', status: 'open' },
        {
          id: 'UI-2',
          title: 'Closed',
          status: 'closed',
          dependencies: [
            {
              issue_id: 'UI-2',
              depends_on_id: 'UI-1',
              type: 'blocks'
            }
          ]
        }
      ]
    });
    const store = createStore({ graph: { show_closed: false } });
    const view = createGraphView(mount, () => {}, issueStores, store);

    await view.load();

    expect(mount.querySelectorAll('.graph-edge').length).toBe(0);
  });

  test('updates graph preference when toggling closed issues', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:graph').applyPush({
      type: 'snapshot',
      id: 'tab:graph',
      revision: 1,
      issues: [
        { id: 'UI-1', title: 'Open', status: 'open' },
        { id: 'UI-2', title: 'Closed', status: 'closed' }
      ]
    });
    const store = createStore({ graph: { show_closed: true } });
    const view = createGraphView(mount, () => {}, issueStores, store);
    await view.load();

    const input = /** @type {HTMLInputElement | null} */ (
      mount.querySelector('.graph-toggle input')
    );
    if (input) {
      input.checked = false;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    expect(store.getState().graph.show_closed).toBe(false);
    expect(mount.querySelectorAll('.graph-node').length).toBe(1);
    expect(mount.textContent).not.toContain('UI-2');
  });
});
