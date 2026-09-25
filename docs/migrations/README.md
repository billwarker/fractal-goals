# Historical migration records

These documents record the pre-Alembic data migrations performed in January 2026.
The one-off `python-scripts/` they reference (SQLite-era migrations, debug and
table-recreation utilities) were removed in September 2026 because they targeted
schemas that no longer exist and were unsafe to run against a live database.

All schema changes now go through Alembic; see
[Database migration policy](../architecture/MIGRATION_POLICY.md). The retired
scripts remain recoverable from git history:

```bash
git log --diff-filter=D --oneline -- python-scripts
git show <commit>^:python-scripts/<path>
```
