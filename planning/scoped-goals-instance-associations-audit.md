# Scoped goals and one-off instance associations

## Outcome and architectural audit

Goal scope now seeds create/copy activity-definition drafts without resetting an open draft.
Copies retain existing selections; editing an existing definition keeps its current selections.
Selections remain editable. Scoped cards provide accessible, reversible instance association
controls in active and completed sessions, including circuit member instances. Pending controls
share an instance mutation key, prevent repeat submissions, and retain actionable errors.
Definition/group contributions are explained separately when removing a direct instance link.

Authenticated GET/POST/DELETE routes delegate to an instance association service. Every write
validates root ownership and live instance/session/goal records, locks the root and instance,
and commits association, target reconciliation, and history together. Add/remove are idempotent;
re-add restores the original row and creation date. Domain association events emit after commit,
with the history event ID reused to avoid duplicate asynchronous event logs.

The new table has cascading foreign keys, composite primary key, creation/soft-deletion timestamps,
and a reverse goal lookup index. Migration is additive with no backfill. Instance serialization
projects direct goal IDs in the instance query; expression values survive unrelated flushes and
are explicitly expired after link mutations. Queries resolve explicit links in batches.

Evidence unions direct instance links with existing definition/group sources, deduplicates by
instance ID, and preserves upward rollups. Instance links never widen reusable catalogs or flow
downward into other activities. Timeline/heatmap, goal metrics, targets, session filters, goal
analytics, program metrics, and FlowTree evidence now include direct links. Retroactive evidence
retains occurrence dates and existing goal lifetime, pause, completion, and target-window rules.
Target reconciliation preserves manual goal completion and alternative evidence when associations,
completion, or metric values change. Duplicated instances/sessions begin without one-off links.

The prior duplicate metrics attribution implementation was removed. Timeline, targets, metrics,
and analytics use the shared instance attribution helpers and existing contribution/target rules.
The reusable catalog resolver remains definition/group-only by design. Drag-card and circuit
member-header composition were extracted to keep touched components within existing size limits.

## Verification

- Frontend: 317 test files / 1,589 tests passed.
- Desktop/mobile Playwright: both passed, including removing a link after completing the session
  and reopening the session before scoped definition creation.
- Production Vite build, ESLint, frontend TypeScript, responsive audit, backend maintainability,
  generated-schema consistency, and `git diff --check` passed.
- Backend complete suite: 1,361 tests passed; agent adapter suite: 7 tests passed.
- Existing repository gates still fail: basedpyright reports the same 21 errors reproduced at
  clean HEAD, and frontend maintainability reports existing size/control/selector debt. No
  touched component/test adds a new size-budget violation.

- PostgreSQL association integration coverage: idempotency, reactivation, concurrent duplicate
  requests, rollback, tenant/root isolation, deleted records, one-of-two executions, overlapping
  sources, ancestor rollups, downward inheritance exclusions, lifetime/pause/completion exclusions,
  target types/windows/binding, completed-session corrections, alternative evidence, duplication,
  related-session attribution, and constant query counts across growing instance collections.
- Unit coverage: canonical attribution and scope-draft snapshots; client integration coverage:
  editable builder selections, cache invalidation, pending/error states, sibling isolation,
  hierarchy highlights, and actual circuit member controls.
- Fresh PostgreSQL migration: upgrade, schema drift check, downgrade, re-upgrade, repeated drift
  check; transactional migration integration test verifies keys, index, and cascade behavior.
- Production build and desktop/mobile Playwright QA verify scope selection, association persistence,
  removal, sibling isolation, scoped creation, accessible controls, and no horizontal overflow.

## Backend failures corrected during acceptance

The development database was still on the previous migration and also lacked the primary key
on `goals.id`. All 115 existing goal IDs were verified unique/non-null before restoring that
constraint under a transaction/table lock. No goal rows were removed. The local database was
then upgraded to `a4c6e8f0b2d4`, existing instance projections were checked, and the actual
`python app.py` startup and `/api/readyz` returned successfully. This was a local schema repair;
the additive feature migration does not silently rewrite legacy production constraints.

A missing Session import and an expiring ORM expression caused endpoint errors and extra mutation
queries. These are corrected, without increasing existing performance budgets. History publication
now derives instance links from its preloaded instances rather than executing a redundant query.
Deletion reconciliation reuses the ORM identity map so ordinary activity removal retains its
existing query budget. Goal-filtered session discovery expands explicit child links upward
through one root-scoped recursive query, preserving ancestor rollups without extra round trips.
Program templates and goal pause intervals use suitable eager joins to avoid extra round trips.

An isolated clean-HEAD comparison also reproduced the stale agent schema artifact, two program
metrics budget failures, and a date-sensitive program unschedule test. The artifact was regenerated
from canonical validators, program template loading was optimized, and the test now uses the same
UTC occurrence date for schedule and execution. Daily-active-user fixtures now explicitly seed
current-day activity, avoiding accidental previous-day evidence around midnight UTC.

## Quality rating and distance to S+

Feature rating: A+. Full repository S+ remains conditional on all repository quality gates being
clean. Existing backend type-check errors and frontend maintainability failures were reproduced
at clean HEAD; they are tracked separately from this feature and must not be described as passing.
The feature introduces no new type errors or maintainability exceptions. Remaining work to reach
repository-wide S+ is to clear that existing type/maintainability debt and broaden browser QA to
completed-session target correction and circuit interaction flows.

Useful follow-ups: show the source of evidence in goal detail (instance, definition, or group),
offer bulk one-off association for selected instances, and expose a scoped evidence summary with
links to the contributing executions. Keep bulk operations reversible and distinguish catalog
membership from historical evidence.

Commit message: `Add scoped goal defaults and instance-level goal associations`

## Icon-only control follow-up — 2026-10-11

Before: the full association action and explanatory text occupied permanent space on each card.
The behavior was reliable, but the presentation added unnecessary clutter.

After: the shared GoalIcon renders the scoped goal's shape, primary/secondary colors, and SMART
appearance inside the shared IconButton. The button contains no visible text. The shared portalled
Tooltip carries the action and instance/definition/group explanation on hover or keyboard focus,
without being clipped by activity cards. Accessible labels, described-by linkage, 44px hit area,
pressed/linked styling, busy/disabled state, duplicate-click protection, and actionable errors remain.
The obsolete visible hint and its styling were removed; no competing icon or tooltip was introduced.

Verification: 13 focused control/circuit/atom tests passed; desktop and mobile production-browser
checks passed, including focused tooltip screenshots and completed-session association removal.
Screenshots were visually reviewed. Production Vite build and frontend TypeScript passed; ESLint
has no errors and retains one pre-existing ProgramCalendarPage compiler warning. Existing frontend
maintainability debt remains, with no new violation from the changed control. `git diff --check`
passed. `index.md` reflects the icon/tooltip interaction.

Rating: S+ for this UI change. No remaining work identified within its scope; repository-wide
S+ still requires clearing the previously documented quality-gate debt.

Commit message: `Use scoped goal icon for instance associations`

## Scoped ring follow-up — 2026-10-11

Before: the association icon matched the goal's shape and colors but omitted the hierarchy's
active-scope ring. After: its icon wrapper reuses the hierarchy's existing scoped halo class,
including the same secondary-color border and glow. Scope remains visually distinct from the
association's pressed/bordered state. No duplicate ring styling or alternate icon was added.

Verification: all 6 focused association/circuit tests, both desktop/mobile production-browser
checks, production build, scoped ESLint, and `git diff --check` passed. The production screenshot
was visually checked. `index.md` records the shared ring treatment.

Rating: S+ within this visual change; no remaining scope-specific gap identified. Existing
repository-wide quality debt is unchanged.

Commit message: `Add scoped ring to instance goal icon`


## Header action alignment follow-up — 2026-10-11

Before: the scoped icon occupied a separate padded row with a 44px button and 22px symbol,
visually separating it from the activity's pencil and options controls.

After: the icon is in the existing header action group, after options and before tags. It reuses
the pencil/options button class (28px) with a 14px GoalIcon. The scoped ring, hover/focus tooltip,
pressed/busy state, and actionable errors remain. Unselected scoped instances retain their icon;
empty read-only tag controls are not introduced. Circuit member icons also move into their headers.
The obsolete below-header slots and independent size/padding rules were removed.

Verification: 13 focused control, circuit, and activity-header tests passed. Both desktop/mobile
production-browser checks passed, explicitly asserting shared action-group placement and equal
button dimensions/vertical alignment with pencil and options. Screenshots were visually reviewed.
Production Vite build, scoped ESLint, and `git diff --check` passed. `index.md` records the placement
and sizing invariant.

Rating: S+ for this requested UI adjustment; no remaining scope-specific gap identified. Existing
repository-wide maintainability/type-check debt documented above still prevents a repository-wide
S+ rating. The compact hit area deliberately matches the existing controls as requested.

Commit message: `Align scoped goal icon with activity header actions`

## Association ring state follow-up — 2026-10-11

Before: every scoped instance icon showed the hierarchy ring, including unassociated instances.
After: the shared ring class is applied only when the instance's direct `associated_goal_ids`
contains the current scoped goal. Add/remove responses update this same state; broader definition
or group attribution does not imply a direct link. The existing icon, tooltip, header placement,
pressed state, and mutation path remain shared for standalone and circuit member instances.
No second ring implementation or redundant association state was introduced.

Verification: 6 focused control/circuit tests passed. Both desktop/mobile production-browser
checks passed, verifying no ring before association, a ring on the linked instance, no ring on its
unlinked sibling, and removal of the ring after completed-session unlinking. Production build,
scoped ESLint, and `git diff --check` passed. `index.md` now documents the association-driven ring.

Rating: S+ for this state/presentation adjustment, with no remaining scope-specific gap identified.
The previously documented repository-wide quality-gate debt remains separate.

Commit message: `Show scoped goal ring only on associated instances`

## Neutral associated-button styling — 2026-10-11

Before: association added a selected background and a goal-colored button border in addition to
the scoped ring. After: associated and unassociated buttons use the existing neutral header-action
styles. The ring remains the visual association indicator, with accessible pressed state retained.
Removed the obsolete pressed-state CSS and its now-unused goal-color custom property. The shared
control applies this treatment to standalone and circuit member instances.

Verification: all 6 focused association/circuit tests, production Vite build, scoped ESLint, and
`git diff --check` passed. `index.md` now records neutral button styling. Browser QA was not rerun
for this CSS removal; the preceding desktop/mobile ring and layout checks remain documented above.

Rating: S+ for this small styling adjustment; no remaining implementation gap identified within
scope. Existing repository-wide quality-gate debt is unchanged.

Commit message: `Keep associated goal buttons neutral`
