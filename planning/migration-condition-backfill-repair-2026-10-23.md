# Goal-condition migration deployment repair — October 23, 2026

## Failure and initial audit

Cloud Run's `migrate-db` job failed while applying `b7d9f1a3c5e7 → e1a2c3d4f5b6`:
`psycopg2.errors.UndefinedColumn: column goals.review_cadence_value does not exist`.
The conversion migration's completion backfill called the current goal serializer/ORM loader.
That loader selects review fields introduced by the later `b5c6d7e8f9a0` revision. Its eager
relationships and review-note reads also belong to HEAD rather than this historical schema.

Initial deployment-readiness grade: C. Existing coverage exercised an empty zero-to-head upgrade
and rebuilt migration A on a schema created from current models. Empty databases have no converted
goals to evaluate, while the model-created schema already has the future columns; neither exposed
the populated historical-schema failure. Adding more future columns to A would perpetuate the bug.

The S+ target is a schema-compatible backfill with unchanged condition mathematics, preserved user
completion decisions, and populated historical upgrades tested through HEAD and metadata parity.

## Repair and migration safety

- A's backfill now reads plain SQL projections through `migrations/condition_backfill.py`, limited
  to columns/tables present by A. It supplies goals, pauses, conditions, associations, activities,
  sets and metrics to the canonical evaluator. Passing no ORM session deliberately prevents a
  silent fallback to application-model queries.
- Evidence remains root-scoped, excludes deleted/incomplete instances and deleted sessions, and
  honors goal lifetime, deadline, pause history, direct/group associations and manual declines.
  Metric multiplication follows the authoritative fractal-metric setting. Already completed and
  currently paused goals are not changed. No second condition evaluator was introduced.
- The existing backfill UPDATE and its transactional boundary are retained. No revision IDs, DDL,
  target-conversion rules or completion reason values changed; no new destructive operation exists.
- The failed revision's executable entry point must be repaired because a corrective revision
  after it cannot be reached. Already-stamped databases do not rerun it. Fresh and failed-forward
  upgrades use the repair through the ordinary `alembic upgrade head` path.
- No production database was accessed, modified or stamped during this repair. The existing
  later contract migration still has its existing backup/rollout requirements.

## Regression evidence

The new historical-upgrade regression first reproduced the exact missing-review-column failure
against a disposable database upgraded from zero to `b7d9f1a3c5e7`, then populated with a legacy
target and evidence predating that target. With the repair, the upgrade reaches HEAD and completes
the converted goal at its actual evidence date/session with `condition_met_at_migration`.

The gate covers both empty and populated upgrades, `alembic check`, and latest-revision downgrade /
re-upgrade / metadata parity. It runs in the existing backend integration CI suite. Disposable
databases are uniquely named, test-only and dropped in fixture cleanup.

Nineteen backfill cases cover met/unmet/empty history, set and cumulative/yield conditions,
skipped sets, pause intervals, current pause, manual decline, goal/instance/session deletion,
unfinished instances, start/deadline exclusions, already completed goals, and direct/group
attribution. Eligible cases are compared with the runtime evaluator, including achievement dates
and sessions. The existing migration conversion/reversal test remains in the validation set.

Final validation: all 98 migration/condition checks passed in 36.55 seconds, covering both upgrade
shapes, all nineteen backfill cases, the original conversion/reversal test, condition API and pure
evaluator/conversion tests, and backend CI quality gates. `git diff --check` passes. The existing
backend type-check baseline remains 15 errors; this repair adds none. Frontend code is unchanged,
so no client build was required for this repair.

## Final quality audit and rollout

The historical-schema dependency is removed and the old ORM backfill path is deleted. The schema
and canonical completion math remain unchanged. The remaining distance to production S+ is a
successful deployment of the repaired artifact against the actual production migration state;
local populated-upgrade evidence cannot certify that unseen state. Repository-wide static-quality
debt remains separate from this deployment blocker.

Commit the repair and retry the existing build/deployment so its migration job runs the repaired
artifact. No manual addition of review columns or Alembic stamping past the failed revision is
part of this fix.

Suggested commit: `fix(migrations): Isolate condition backfill from future ORM columns`
