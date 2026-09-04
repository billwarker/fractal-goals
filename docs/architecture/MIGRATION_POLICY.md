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

## Corrective revisions

A corrective revision must explain why the original review/test gate missed the problem and
add a regression gate that prevents the same class of drift. Never edit an already deployed
revision to conceal history. Multiple rollout shapes must converge deterministically without
silently discarding ambiguous user data.

Revision `b3d5f7a9c2e4` is the standing example of a destructive contract migration: obsolete
`progress_records` snapshots can be dropped only as an explicit rollout decision with a
verified backup. Its warning belongs here rather than as an isolated changelog note.

