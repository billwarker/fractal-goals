# Database Migration Policy

Alembic history is append-only after deployment. Corrective migrations are a recovery tool,
not the normal way to finish a feature migration.

## Required before merge

1. State whether the revision is additive, contractive, data-transforming, or destructive.
2. For data changes, document idempotency, expected lock/runtime behaviour, and how partially
   applied or head-stamped databases converge.
3. Run fresh zero-to-head upgrade, `alembic check`, and one-revision downgrade/re-upgrade.
4. For contractive/destructive work, take and record a restorable pre-migration backup, name
   the data that will be discarded, provide a verification query, and obtain an explicit
   rollout decision. Follow `BACKUP_RESTORE_RUNBOOK.md` for recovery evidence.
5. Application readers must stop depending on a column/table before its contract migration.
6. Exercise populated upgrades at each data-transforming boundary. Empty upgrades do not execute
   backfill branches, and reversing one migration on a model-created HEAD schema does not recreate
   its historical column set. Migration reads must use revision-local SQL/projections rather than
   hydrating current application ORM models or calling serializers with evolving eager loaders.

## Corrective revisions

A corrective revision must explain why the original review/test gate missed the problem and
add a regression gate that prevents the same class of drift. Never edit an already deployed
revision to conceal history. Multiple rollout shapes must converge deterministically without
silently discarding ambiguous user data.

When an unstamped forward migration fails before a corrective revision can be reached, repair the
failing backfill entry point with the smallest schema-compatible change. Preserve its revision ID,
DDL, conversion rules and transaction boundary; record the failure and a populated historical-schema
regression. Already-stamped databases are untouched by that repair. Do not stamp past a failure or
add future columns manually to make current ORM reads work.

The October 23, 2026 repair of `e1a2c3d4f5b6` follows that recovery path: current goal ORM reads
selected review columns introduced later in the chain. Its SQL evidence reader lives in
`migrations/condition_backfill.py`; `tests/integration/test_populated_migration_upgrade.py` exercises
the preceding production revision through HEAD. Details: [repair audit](../../planning/migration-condition-backfill-repair-2026-10-23.md).

Revision `b3d5f7a9c2e4` is the standing example of a destructive contract migration: obsolete
`progress_records` snapshots can be dropped only as an explicit rollout decision with a
verified backup. Its warning belongs here rather than as an isolated changelog note.

