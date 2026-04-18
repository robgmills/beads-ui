import { html, render, svg } from 'lit-html';
import {
  filterIssuesByClosedFilter,
  normalizeClosedFilter
} from '../utils/closed-filter.js';
import { debug } from '../utils/logging.js';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 72;
const LAYER_GAP = 300;
const ROW_GAP = 124;
const GRAPH_PADDING = 48;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   status?: string,
 *   priority?: number,
 *   issue_type?: string,
 *   closed_at?: number | null,
 *   dependencies?: unknown[],
 *   dependents?: unknown[],
 *   x?: number,
 *   y?: number
 * }} GraphIssue
 */

/**
 * @typedef {{ id: string, source: string, target: string, type: string }} GraphEdge
 */

/**
 * @typedef {{
 *   nodes: Array<GraphIssue & { x: number, y: number }>,
 *   edges: GraphEdge[],
 *   width: number,
 *   height: number
 * }} GraphModel
 */

/**
 * Render an interactive issue dependency graph from subscription snapshots.
 *
 * @param {HTMLElement} mount_element
 * @param {(id: string) => void} gotoIssue
 * @param {{ snapshotFor?: (client_id: string) => GraphIssue[], subscribe?: (fn: () => void) => () => void }} [issue_stores]
 * @param {{ getState?: () => { board?: { closed_filter?: unknown } }, setState?: (patch: { board?: { closed_filter?: 'today'|'3'|'7' } }) => void, subscribe?: (fn: (state: unknown) => void) => () => void }} [store]
 * @returns {{ load: () => Promise<void>, clear: () => void, destroy: () => void }}
 */
export function createGraphView(
  mount_element,
  gotoIssue,
  issue_stores = undefined,
  store = undefined
) {
  const log = debug('views:graph');
  /** @type {GraphModel} */
  let model = buildGraphModel([]);
  /** @type {GraphIssue[]} */
  let raw_issues = [];
  /** @type {{ x: number, y: number, scale: number }} */
  let transform_state = { x: 24, y: 24, scale: 1 };
  /** @type {{ pointer_id: number, start_x: number, start_y: number, origin_x: number, origin_y: number } | null} */
  let active_pan = null;
  /** @type {'today'|'3'|'7'} */
  let local_closed_filter = 'today';
  /** @type {null | (() => void)} */
  let unsubscribe_issues = null;
  /** @type {null | (() => void)} */
  let unsubscribe_store = null;

  if (issue_stores && typeof issue_stores.subscribe === 'function') {
    unsubscribe_issues = issue_stores.subscribe(() => {
      refreshFromStore();
    });
  }
  if (store && typeof store.subscribe === 'function') {
    unsubscribe_store = store.subscribe(() => {
      rebuildModel();
      doRender();
    });
  }

  /**
   * Render the current graph model.
   */
  function doRender() {
    render(template(), mount_element);
  }

  /**
   * @returns {import('lit-html').TemplateResult}
   */
  function template() {
    const issue_count = model.nodes.length;
    const edge_count = model.edges.length;
    const closed_filter = getClosedFilter();
    return html`
      <div class="graph-root">
        <div class="graph-toolbar" aria-label="Graph controls">
          <div class="graph-toolbar__summary">
            <strong>Issue graph</strong>
            <span class="muted">${issue_count} issues</span>
            <span class="muted">${edge_count} links</span>
          </div>
          <div class="graph-toolbar__actions">
            <label class="graph-closed-filter">
              <span>Closed</span>
              <select
                aria-label="Filter closed issues"
                @change=${onClosedFilterChange}
              >
                <option value="today" ?selected=${closed_filter === 'today'}>
                  Today
                </option>
                <option value="3" ?selected=${closed_filter === '3'}>
                  Last 3 days
                </option>
                <option value="7" ?selected=${closed_filter === '7'}>
                  Last 7 days
                </option>
              </select>
            </label>
            <button type="button" @click=${zoomIn}>Zoom in</button>
            <button type="button" @click=${zoomOut}>Zoom out</button>
            <button type="button" @click=${resetView}>Reset</button>
          </div>
        </div>
        ${issue_count === 0
          ? html`<div class="graph-empty muted">No issues found.</div>`
          : graphTemplate()}
      </div>
    `;
  }

  /**
   * @returns {import('lit-html').TemplateResult}
   */
  function graphTemplate() {
    const transform = `translate(${transform_state.x} ${transform_state.y}) scale(${transform_state.scale})`;
    return html`
      <svg
        class="graph-canvas"
        role="img"
        aria-label="Issue dependency graph"
        viewBox="0 0 ${Math.max(model.width, 600)} ${Math.max(
          model.height,
          400
        )}"
        @wheel=${onWheel}
        @pointerdown=${onPointerDown}
        @pointermove=${onPointerMove}
        @pointerup=${onPointerUp}
        @pointercancel=${onPointerUp}
      >
        <defs>
          <marker
            id="graph-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z"></path>
          </marker>
        </defs>
        <g class="graph-world" transform=${transform}>
          <g class="graph-edges">
            ${model.edges.map((edge) => edgeTemplate(edge))}
          </g>
          <g class="graph-nodes">
            ${model.nodes.map((node) => nodeTemplate(node))}
          </g>
        </g>
      </svg>
    `;
  }

  /**
   * @param {GraphEdge} edge
   */
  function edgeTemplate(edge) {
    const source_node = model.nodes.find((node) => node.id === edge.source);
    const target_node = model.nodes.find((node) => node.id === edge.target);
    if (!source_node || !target_node) {
      return null;
    }
    const source_x = source_node.x + NODE_WIDTH;
    const source_y = source_node.y + NODE_HEIGHT / 2;
    const target_x = target_node.x;
    const target_y = target_node.y + NODE_HEIGHT / 2;
    const curve = Math.max(80, Math.abs(target_x - source_x) / 2);
    const path = `M ${source_x} ${source_y} C ${source_x + curve} ${source_y}, ${target_x - curve} ${target_y}, ${target_x} ${target_y}`;
    return svg`
      <path
        class="graph-edge graph-edge--${edge.type}"
        d=${path}
        marker-end="url(#graph-arrow)"
      >
        <title>${edge.source} blocks ${edge.target}</title>
      </path>
    `;
  }

  /**
   * @param {GraphIssue & { x: number, y: number }} node
   */
  function nodeTemplate(node) {
    const priority =
      typeof node.priority === 'number' ? `P${node.priority}` : 'P?';
    const issue_type = graphNodeType(node.issue_type);
    return svg`
      <g
        class="graph-node graph-node--${String(node.status || 'open')} graph-node--type-${issue_type}"
        data-issue-id=${node.id}
        role="button"
        tabindex="0"
        aria-label=${`${node.id} ${node.title || '(no title)'}`}
        transform=${`translate(${node.x} ${node.y})`}
        @click=${() => gotoIssue(node.id)}
        @keydown=${(/** @type {KeyboardEvent} */ ev) =>
          onNodeKeyDown(ev, node.id)}
      >
        <rect class="graph-node__box" width=${NODE_WIDTH} height=${NODE_HEIGHT} rx="8"></rect>
        <text class="graph-node__id" x="14" y="24">${node.id}</text>
        <text class="graph-node__title" x="14" y="46">${truncateTitle(node.title)}</text>
        <text class="graph-node__meta" x="14" y="64">
          ${String(node.issue_type || 'task')} - ${String(node.status || 'open')} - ${priority}
        </text>
      </g>
    `;
  }

  /**
   * @param {KeyboardEvent} ev
   * @param {string} issue_id
   */
  function onNodeKeyDown(ev, issue_id) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      gotoIssue(issue_id);
    }
  }

  /**
   * @param {WheelEvent} ev
   */
  function onWheel(ev) {
    ev.preventDefault();
    const delta = ev.deltaY < 0 ? 1.12 : 0.88;
    const next_scale = clampScale(transform_state.scale * delta);
    if (next_scale === transform_state.scale) {
      return;
    }
    const rect = /** @type {SVGSVGElement} */ (
      ev.currentTarget
    ).getBoundingClientRect();
    const pointer_x = ev.clientX - rect.left;
    const pointer_y = ev.clientY - rect.top;
    const graph_x = (pointer_x - transform_state.x) / transform_state.scale;
    const graph_y = (pointer_y - transform_state.y) / transform_state.scale;
    transform_state = {
      x: pointer_x - graph_x * next_scale,
      y: pointer_y - graph_y * next_scale,
      scale: next_scale
    };
    doRender();
  }

  /**
   * @param {PointerEvent} ev
   */
  function onPointerDown(ev) {
    const target = /** @type {Element | null} */ (ev.target);
    if (target && target.closest('.graph-node')) {
      return;
    }
    active_pan = {
      pointer_id: ev.pointerId,
      start_x: ev.clientX,
      start_y: ev.clientY,
      origin_x: transform_state.x,
      origin_y: transform_state.y
    };
    try {
      /** @type {SVGSVGElement} */ (ev.currentTarget).setPointerCapture(
        ev.pointerId
      );
    } catch {
      // ignore pointer capture failures
    }
  }

  /**
   * @param {PointerEvent} ev
   */
  function onPointerMove(ev) {
    if (!active_pan || active_pan.pointer_id !== ev.pointerId) {
      return;
    }
    transform_state = {
      ...transform_state,
      x: active_pan.origin_x + ev.clientX - active_pan.start_x,
      y: active_pan.origin_y + ev.clientY - active_pan.start_y
    };
    doRender();
  }

  /**
   * @param {PointerEvent} ev
   */
  function onPointerUp(ev) {
    if (!active_pan || active_pan.pointer_id !== ev.pointerId) {
      return;
    }
    active_pan = null;
    try {
      /** @type {SVGSVGElement} */ (ev.currentTarget).releasePointerCapture(
        ev.pointerId
      );
    } catch {
      // ignore pointer capture failures
    }
  }

  function zoomIn() {
    transform_state = {
      ...transform_state,
      scale: clampScale(transform_state.scale * 1.2)
    };
    doRender();
  }

  function zoomOut() {
    transform_state = {
      ...transform_state,
      scale: clampScale(transform_state.scale / 1.2)
    };
    doRender();
  }

  function resetView() {
    transform_state = { x: 24, y: 24, scale: 1 };
    doRender();
  }

  function refreshFromStore() {
    try {
      raw_issues =
        issue_stores && typeof issue_stores.snapshotFor === 'function'
          ? issue_stores.snapshotFor('tab:graph')
          : [];
      rebuildModel();
      doRender();
    } catch (err) {
      log('refresh failed: %o', err);
      raw_issues = [];
      model = buildGraphModel([]);
      doRender();
    }
  }

  function rebuildModel() {
    model = buildGraphModel(
      filterIssuesByClosedFilter(raw_issues, getClosedFilter())
    );
  }

  /**
   * @returns {'today'|'3'|'7'}
   */
  function getClosedFilter() {
    const state =
      store && typeof store.getState === 'function'
        ? store.getState()
        : undefined;
    return normalizeClosedFilter(
      state && state.board ? state.board.closed_filter : local_closed_filter
    );
  }

  /**
   * @param {Event} ev
   */
  function onClosedFilterChange(ev) {
    const target = /** @type {HTMLSelectElement | null} */ (ev.target);
    const closed_filter = normalizeClosedFilter(
      target ? target.value : 'today'
    );
    if (store && typeof store.setState === 'function') {
      store.setState({ board: { closed_filter } });
      return;
    }
    local_closed_filter = closed_filter;
    rebuildModel();
    doRender();
  }

  return {
    async load() {
      refreshFromStore();
    },
    clear() {
      raw_issues = [];
      model = buildGraphModel([]);
      render(html``, mount_element);
    },
    destroy() {
      if (unsubscribe_issues) {
        unsubscribe_issues();
        unsubscribe_issues = null;
      }
      if (unsubscribe_store) {
        unsubscribe_store();
        unsubscribe_store = null;
      }
      render(html``, mount_element);
    }
  };
}

/**
 * Build graph nodes, directed edges, and deterministic node coordinates.
 *
 * @param {GraphIssue[]} issues
 * @returns {GraphModel}
 */
export function buildGraphModel(issues) {
  /** @type {Map<string, GraphIssue>} */
  const node_by_id = new Map();
  for (const issue of issues) {
    const id = String(issue?.id || '');
    if (id.length > 0) {
      node_by_id.set(id, { ...issue, id });
    }
  }

  /** @type {Map<string, GraphEdge>} */
  const edge_by_id = new Map();
  for (const issue of node_by_id.values()) {
    for (const edge of edgesFromIssue(issue)) {
      if (node_by_id.has(edge.source) && node_by_id.has(edge.target)) {
        edge_by_id.set(edge.id, edge);
      }
    }
  }
  const edges = Array.from(edge_by_id.values()).sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  /** @type {Map<string, string[]>} */
  const incoming_by_id = new Map();
  for (const edge of edges) {
    const incoming = incoming_by_id.get(edge.target) || [];
    incoming.push(edge.source);
    incoming_by_id.set(edge.target, incoming);
  }

  /** @type {Map<string, number>} */
  const depth_by_id = new Map();
  /**
   * @param {string} id
   * @param {Set<string>} visiting
   * @returns {number}
   */
  function depthFor(id, visiting) {
    const cached = depth_by_id.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(id)) {
      return 0;
    }
    visiting.add(id);
    const incoming = incoming_by_id.get(id) || [];
    let depth = 0;
    for (const source of incoming.sort()) {
      if (source !== id) {
        depth = Math.max(depth, depthFor(source, visiting) + 1);
      }
    }
    visiting.delete(id);
    depth_by_id.set(id, depth);
    return depth;
  }

  /** @type {Map<number, GraphIssue[]>} */
  const layers = new Map();
  const sorted_nodes = Array.from(node_by_id.values()).sort(compareGraphIssues);
  for (const node of sorted_nodes) {
    const depth = depthFor(node.id, new Set());
    const layer = layers.get(depth) || [];
    layer.push(node);
    layers.set(depth, layer);
  }

  /** @type {Array<GraphIssue & { x: number, y: number }>} */
  const nodes = [];
  let max_layer_size = 0;
  const ordered_depths = Array.from(layers.keys()).sort((a, b) => a - b);
  for (const depth of ordered_depths) {
    const layer = (layers.get(depth) || []).sort((a, b) =>
      String(a.id).localeCompare(String(b.id))
    );
    max_layer_size = Math.max(max_layer_size, layer.length);
    for (let index = 0; index < layer.length; index++) {
      const node = layer[index];
      nodes.push({
        ...node,
        x: GRAPH_PADDING + depth * LAYER_GAP,
        y: GRAPH_PADDING + index * ROW_GAP
      });
    }
  }

  return {
    nodes,
    edges,
    width:
      GRAPH_PADDING * 2 +
      NODE_WIDTH +
      Math.max(0, ordered_depths.length - 1) * LAYER_GAP,
    height:
      GRAPH_PADDING * 2 +
      NODE_HEIGHT +
      Math.max(0, max_layer_size - 1) * ROW_GAP
  };
}

/**
 * @param {GraphIssue} issue
 * @returns {GraphEdge[]}
 */
function edgesFromIssue(issue) {
  /** @type {GraphEdge[]} */
  const edges = [];
  const target = issue.id;
  if (Array.isArray(issue.dependencies)) {
    for (const dep of issue.dependencies) {
      const source = dependencySourceId(dep);
      if (source && source !== target) {
        const type = dependencyType(dep);
        edges.push({
          id: `${source}->${target}:${type}`,
          source,
          target,
          type
        });
      }
    }
  }
  if (Array.isArray(issue.dependents)) {
    for (const dependent of issue.dependents) {
      const dependent_id = dependentTargetId(dependent);
      if (dependent_id && dependent_id !== issue.id) {
        const type = dependencyType(dependent);
        edges.push({
          id: `${issue.id}->${dependent_id}:${type}`,
          source: issue.id,
          target: dependent_id,
          type
        });
      }
    }
  }
  return edges;
}

/**
 * @param {unknown} dep
 * @returns {string}
 */
function dependencySourceId(dep) {
  if (!dep || typeof dep !== 'object') {
    return '';
  }
  const any_dep = /** @type {{ depends_on_id?: unknown, id?: unknown }} */ (
    dep
  );
  if (typeof any_dep.depends_on_id === 'string') {
    return any_dep.depends_on_id;
  }
  if (typeof any_dep.id === 'string') {
    return any_dep.id;
  }
  return '';
}

/**
 * @param {unknown} dependent
 * @returns {string}
 */
function dependentTargetId(dependent) {
  if (!dependent || typeof dependent !== 'object') {
    return '';
  }
  const any_dependent = /** @type {{ issue_id?: unknown, id?: unknown }} */ (
    dependent
  );
  if (typeof any_dependent.issue_id === 'string') {
    return any_dependent.issue_id;
  }
  if (typeof any_dependent.id === 'string') {
    return any_dependent.id;
  }
  return '';
}

/**
 * @param {unknown} dep
 * @returns {string}
 */
function dependencyType(dep) {
  if (!dep || typeof dep !== 'object') {
    return 'blocks';
  }
  const any_dep = /** @type {{ type?: unknown }} */ (dep);
  return typeof any_dep.type === 'string' && any_dep.type.length > 0
    ? any_dep.type
    : 'blocks';
}

/**
 * @param {string | undefined} title
 */
function truncateTitle(title) {
  const value = String(title || '(no title)');
  return value.length > 28 ? `${value.slice(0, 25)}...` : value;
}

/**
 * @param {number} value
 */
function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/**
 * @param {GraphIssue} a
 * @param {GraphIssue} b
 */
function compareGraphIssues(a, b) {
  const priority_a =
    typeof a.priority === 'number' && Number.isFinite(a.priority)
      ? a.priority
      : 999;
  const priority_b =
    typeof b.priority === 'number' && Number.isFinite(b.priority)
      ? b.priority
      : 999;
  if (priority_a !== priority_b) {
    return priority_a - priority_b;
  }
  return String(a.id).localeCompare(String(b.id));
}

/**
 * @param {unknown} issue_type
 * @returns {'bug'|'feature'|'task'|'epic'|'chore'|'neutral'}
 */
function graphNodeType(issue_type) {
  const value = String(issue_type || '').toLowerCase();
  if (
    value === 'bug' ||
    value === 'feature' ||
    value === 'task' ||
    value === 'epic' ||
    value === 'chore'
  ) {
    return value;
  }
  return 'neutral';
}
