# Shared circuit tags — implementation and quality audit

Date: October 10, 2026

## Initial assessment and target

Circuit tag labels referenced the retired `tag` CSS class rather than the activity
editor's `choice` chip class. Circuit pickers collected bindings only from member
activities. Assignment could create another catalog definition when a same-name tag
already existed on unrelated activities, or silently repoint existing definitions.
These presentation and identity inconsistencies fell short of production quality.

The S+ target for this change was shared activity chip styling, one fractal catalog
for activity/circuit/round tags, stable catalog identity, preserved inheritance and
assignment removal, and production browser plus API regression evidence.

## Implementation audit

- Circuit labels, measurement elements, and overflow summaries share activity chip CSS.
- Circuit pickers read the canonical catalog rather than assembling a member-only pool.
- Existing tags are selected and removed by catalog definition ID. The backend scopes
  that identity to the current fractal and uses authoritative names and colors.
- Name-based creation reuses an unambiguous catalog definition across the fractal.
  Archived definitions and ambiguous/conflicting names are rejected. The retired
  silent definition-reassignment path and member-only collection helper are removed.
- Circuit assignment extends per-activity bindings and advances an existing catalog
  definition's version. Parent/round inheritance and preserved prior assignments
  retain their existing behavior. No schema migration or historical rewrite is needed.
- Catalog and circuit mutations invalidate both sides of their shared read models.
- Activity availability settings, progress-view binding IDs, and planned tags retain
  their existing contracts. `index.md` describes the shared ownership invariant.

## Verification and distance to S+

- The chip regression failed before the fix.
- Circuit API suite: 33 passing tests, including shared identity, stale metadata,
  archives, conflict preservation, assignment removal, and round inheritance.
- Catalog lifecycle suite: six passing tests covering edits, archives, deletion,
  merging, and tenant isolation. The added cross-fractal circuit identity regression
  also passes its focused rerun.
- Focused frontend suites: 68 passing tests, including identity-aware duplicate-name
  options, chip styling, overflow, and catalog invalidation.
- Production Chromium workflow passes on desktop and mobile: selecting an unrelated
  activity's catalog tag, circuit/round chips, reload persistence, one catalog identity,
  and no page-width overflow. Existing count summaries remain valid when space is tight.
- Production build, frontend type checking, changed-file lint, responsive audit,
  backend maintainability, and circuit-service type checking pass. Two resolved
  circuit-service typing errors are removed from the baseline.

The requested feature has production build and regression evidence. Repository-wide
S+ remains blocked by pre-existing lint, backend type-check, and frontend
maintainability failures in unrelated program, agent, picker, and page code, plus
existing raw-control and bespoke-chip budgets. Those gates must be restored before
claiming an S+ production assessment for the entire application.

Suggested commit: `Unify circuit tags with the shared catalog and activity chips`
