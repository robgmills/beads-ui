/**
 * Build a canonical issue hash that retains the view.
 *
 * @param {'issues'|'epics'|'board'|'graph'} view
 * @param {string} id
 */
export function issueHashFor(view, id) {
  const v =
    view === 'epics' || view === 'board' || view === 'graph' ? view : 'issues';
  return `#/${v}?issue=${encodeURIComponent(id)}`;
}
