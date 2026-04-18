import { describe, expect, test } from 'vitest';
import {
  closedFilterSince,
  filterIssuesByClosedFilter,
  isClosedIssueVisibleForClosedFilter,
  isIssueVisibleForClosedFilter,
  normalizeClosedFilter
} from './closed-filter.js';

describe('closed filter utilities', () => {
  test('normalizes invalid values to today', () => {
    expect(normalizeClosedFilter('today')).toBe('today');
    expect(normalizeClosedFilter('3')).toBe('3');
    expect(normalizeClosedFilter('7')).toBe('7');
    expect(normalizeClosedFilter('all')).toBe('today');
  });

  test('returns local day start for today', () => {
    const now = new Date(2026, 3, 17, 15, 30, 0, 0);

    const result = closedFilterSince('today', now);

    expect(result).toBe(new Date(2026, 3, 17, 0, 0, 0, 0).getTime());
  });

  test('returns rolling day windows for numeric ranges', () => {
    const now = new Date(2026, 3, 17, 15, 30, 0, 0);
    const one_day = 24 * 60 * 60 * 1000;

    expect(closedFilterSince('3', now)).toBe(now.getTime() - 3 * one_day);
    expect(closedFilterSince('7', now)).toBe(now.getTime() - 7 * one_day);
  });

  test('filters closed timestamps by range', () => {
    const now = new Date(2026, 3, 17, 15, 30, 0, 0);
    const today = new Date(2026, 3, 17, 8, 0, 0, 0).getTime();
    const yesterday = new Date(2026, 3, 16, 8, 0, 0, 0).getTime();

    expect(isClosedIssueVisibleForClosedFilter(today, 'today', now)).toBe(true);
    expect(isClosedIssueVisibleForClosedFilter(yesterday, 'today', now)).toBe(
      false
    );
    expect(isClosedIssueVisibleForClosedFilter(null, '7', now)).toBe(false);
  });

  test('keeps active issues visible and filters closed issues', () => {
    const now = new Date(2026, 3, 17, 15, 30, 0, 0);
    const old_closed = new Date(2026, 3, 10, 8, 0, 0, 0).getTime();
    const recent_closed = new Date(2026, 3, 17, 8, 0, 0, 0).getTime();

    const result = filterIssuesByClosedFilter(
      [
        { id: 'open', status: 'open' },
        { id: 'progress', status: 'in_progress' },
        { id: 'old', status: 'closed', closed_at: old_closed },
        { id: 'recent', status: 'closed', closed_at: recent_closed }
      ],
      'today',
      now
    ).map((issue) => issue.id);

    expect(result).toEqual(['open', 'progress', 'recent']);
    expect(
      isIssueVisibleForClosedFilter(
        { status: 'closed', closed_at: undefined },
        '7',
        now
      )
    ).toBe(false);
  });
});
