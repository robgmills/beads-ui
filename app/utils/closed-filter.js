/**
 * @typedef {'today'|'3'|'7'} ClosedFilter
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normalize a closed issue range value.
 *
 * @param {unknown} value
 * @returns {ClosedFilter}
 */
export function normalizeClosedFilter(value) {
  if (value === '3' || value === '7' || value === 'today') {
    return value;
  }
  return 'today';
}

/**
 * Calculate the inclusive lower bound for a closed issue range.
 *
 * @param {ClosedFilter} closed_filter
 * @param {Date} [now]
 */
export function closedFilterSince(closed_filter, now = new Date()) {
  if (closed_filter === 'today') {
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    ).getTime();
  }
  const days = closed_filter === '3' ? 3 : 7;
  return now.getTime() - days * ONE_DAY_MS;
}

/**
 * Check whether an issue should be visible for the closed issue range.
 *
 * @param {{ status?: unknown, closed_at?: unknown }} issue
 * @param {ClosedFilter} closed_filter
 * @param {Date} [now]
 */
export function isIssueVisibleForClosedFilter(
  issue,
  closed_filter,
  now = new Date()
) {
  if (String(issue.status || 'open') !== 'closed') {
    return true;
  }
  return isClosedIssueVisibleForClosedFilter(
    issue.closed_at,
    closed_filter,
    now
  );
}

/**
 * Check whether a closed issue timestamp is visible for the range.
 *
 * @param {unknown} closed_at_value
 * @param {ClosedFilter} closed_filter
 * @param {Date} [now]
 */
export function isClosedIssueVisibleForClosedFilter(
  closed_at_value,
  closed_filter,
  now = new Date()
) {
  const closed_at = Number(closed_at_value);
  if (!Number.isFinite(closed_at)) {
    return false;
  }
  return closed_at >= closedFilterSince(closed_filter, now);
}

/**
 * Filter issues by the shared closed issue range.
 *
 * @template {{ status?: unknown, closed_at?: unknown }} T
 * @param {T[]} issues
 * @param {ClosedFilter} closed_filter
 * @param {Date} [now]
 */
export function filterIssuesByClosedFilter(
  issues,
  closed_filter,
  now = new Date()
) {
  return issues.filter((issue) =>
    isIssueVisibleForClosedFilter(issue, closed_filter, now)
  );
}
