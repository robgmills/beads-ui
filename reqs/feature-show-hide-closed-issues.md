# Feature Plan Prompt: Shared Closed-Issue Time Range For Board And Graph

You are Codex working in `/Users/rob/Code/robgmills/beads-ui`.

Read `AGENTS.md` first and follow the beads workflow:

- Use `bd` for task tracking.
- Create or claim an appropriate feature issue before editing code.
- Keep the beads issue current after each milestone.
- Do not edit `CHANGES.md`.
- Run the required validation gates before handoff.
- Commit and push code and beads state before finishing.

## Goal

Update the Graph view so it follows the Board view's closed-issue time range
pattern.

The current Graph view has a `Show closed` checkbox backed by
`graph.show_closed`. Remove that checkbox and replace it with a time range
selector matching the Board view's closed column selector.

The Board and Graph views must share the same closed-issue time range setting.
Changing the selector in either view updates the other view. Closed issues
outside the selected range must not be displayed in either view. Active issues
are not filtered by this closed-issue time range.

## Current Context

The current implementation has:

- `board.closed_filter` with values `today`, `3`, and `7`.
- Board closed column selector with options `Today`, `Last 3 days`, and
  `Last 7 days`.
- Graph `Show closed` checkbox backed by `graph.show_closed`.
- Graph filtering currently hides all closed issues when `show_closed` is false.
- Graph subscribes to `all-issues` and builds nodes/edges client-side.

Prefer reusing the existing Board filter state and time-window behavior instead
of adding a second Graph-specific preference.

## Requirements

```gherkin
Feature: Shared closed-issue time range on Board and Graph

  Background:
    Given the application has issues with statuses "open", "in_progress", and "closed"
    And closed issues have a "closed_at" timestamp
    And the closed-issue time range setting supports "Today", "Last 3 days", and "Last 7 days"

  Scenario: Graph uses a time range selector instead of a show-closed checkbox
    Given the user opens the Graph view
    Then the Graph toolbar should not contain a "Show closed" checkbox
    And the Graph toolbar should contain a closed-issue time range selector
    And the selector options should be "Today", "Last 3 days", and "Last 7 days"

  Scenario: Board and Graph share the same selected time range
    Given the Board closed-issue time range is "Today"
    When the user changes the Board selector to "Last 3 days"
    Then the Graph selector should show "Last 3 days"
    When the user changes the Graph selector to "Last 7 days"
    Then the Board selector should show "Last 7 days"

  Scenario: Closed issues outside the selected range are hidden on the Board
    Given a closed issue was closed today
    And another closed issue was closed 4 days ago
    When the shared time range is "Today"
    Then the Board closed column should show the issue closed today
    And the Board closed column should not show the issue closed 4 days ago

  Scenario: Closed issues outside the selected range are hidden on the Graph
    Given a closed issue was closed today
    And another closed issue was closed 4 days ago
    When the shared time range is "Today"
    Then the Graph should show the issue closed today
    And the Graph should not show the issue closed 4 days ago

  Scenario: Active issues remain visible regardless of closed-issue time range
    Given an open issue exists
    And an in-progress issue exists
    When the shared time range is "Today"
    Then the Board should continue to show active issues in their normal columns
    And the Graph should continue to show active issues as graph nodes

  Scenario: Graph edges only connect visible graph nodes
    Given a visible issue depends on a closed issue outside the selected time range
    When the Graph is rendered
    Then the hidden closed issue should not appear as a node
    And no graph edge should be rendered to or from the hidden closed issue

  Scenario: The shared time range is persisted across sessions
    Given the user selects "Last 7 days" in either Board or Graph
    When the application reloads
    Then the Board selector should show "Last 7 days"
    And the Graph selector should show "Last 7 days"
```

## Implementation Guidance

- Replace Graph-specific `graph.show_closed` state with the shared Board closed
  range state, unless a broader shared state name is cleaner.
- Preserve backward compatibility where practical:
  - Existing `beads-ui.board` persisted `closed_filter` should continue to work.
  - Remove `beads-ui.graph` `show_closed` persistence if it is no longer used.
- Extract shared closed-time filtering logic if needed so Board and Graph use
  the same rules:
  - `today`: closed at or after local day start.
  - `3`: closed within the last 3 days.
  - `7`: closed within the last 7 days.
  - Closed issues without a finite `closed_at` should not display in
    closed-filtered views.
- In the Graph view:
  - Keep active issues visible.
  - Include closed issues only when `closed_at` matches the selected range.
  - Rebuild the graph model from the filtered issue list so hidden nodes and
    their edges disappear together.
- In the Board view:
  - Keep the existing closed column selector behavior.
  - Make sure it stays synchronized when the Graph selector changes the shared
    setting.

## Suggested Test Coverage

Add or update focused tests for:

- State default and updates for the shared closed range.
- Board selector updates the shared state and applies the filter.
- Graph selector updates the shared state and applies the filter.
- Board reflects a Graph-originated range change.
- Graph reflects a Board-originated range change.
- Graph removes nodes and edges for closed issues outside the selected range.
- Active Graph nodes remain visible regardless of the selected closed range.
- Persistence loads and saves the shared closed range.

Run:

- `npm run tsc`
- `npm run lint`
- `npm test`
- `npm run prettier:write`

## Acceptance Criteria

The implementation is complete when:

- The Graph view no longer has a `Show closed` checkbox.
- The Graph view has the same closed-issue time range selector as the Board
  view.
- Board and Graph selectors remain synchronized through shared state.
- Closed issues outside the selected range are hidden on both Board and Graph.
- Active issues remain visible on both views.
- Tests cover the synchronization and filtering behavior.
- Beads issue status, git commit, `bd dolt push`, and `git push` are complete.
