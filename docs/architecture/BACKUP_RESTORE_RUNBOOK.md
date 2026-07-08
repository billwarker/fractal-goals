# Backup & Restore Runbook

Operational runbook for protecting and recovering the Fractal Goals production
database. Beta invites must not go out until the Verification Log at the bottom
has at least one completed row.

## 1. Scope and Data Inventory

| Item | Value |
| --- | --- |
| Production database | Supabase Postgres (project `fractal-goals`) |
| Runtime connection | `SUPABASE_DATABASE_URL` (pooled, Secret Manager, `sslmode=require`) |
| Migration connection | `SUPABASE_DIRECT_DATABASE_URL` (direct, Secret Manager) |
| What lives in it | All user data: accounts, goals, sessions, activities, programs, notes, analytics profiles, email delivery events, product telemetry |
| What does NOT live in it | Built frontend assets, Secret Manager secrets, the landing static snapshot (regenerable via publish) |

Everything that matters is in the one Postgres database. Recovering the
database recovers the product.

## 2. Backup Posture (verify in Supabase dashboard)

Supabase-managed backups are the primary mechanism. The operator must confirm
the actual plan-tier settings in **Dashboard → Project → Database → Backups**
and record them here:

| Setting | Expected | Verified value | Verified on / by |
| --- | --- | --- | --- |
| Automated daily backups | Enabled | _fill in_ | _fill in_ |
| Backup retention | ≥ 7 days | _fill in_ | _fill in_ |
| Point-in-time recovery (PITR) | Optional for beta (paid add-on) | _fill in_ | _fill in_ |

### RPO / RTO targets (private beta)

- **RPO (max acceptable data loss): 24 hours** without PITR — the gap between
  daily automated backups. Enabling PITR reduces this to ~2 minutes.
- **RTO (max acceptable downtime): 2 hours** — dashboard restore or
  pg_restore into a fresh project, plus redeploying with an updated
  `SUPABASE_DATABASE_URL` secret.
- Revisit both before public launch; 24h RPO is acceptable only while the
  beta cohort is small and invite-only.

## 3. Verify-Backups Procedure (monthly + before each invite wave)

1. Open Supabase Dashboard → Database → Backups.
2. Confirm the most recent automated backup completed within the last 24h.
3. Confirm retention and (if enabled) PITR window match the table above.
4. Add a row to the Verification Log below.

## 4. Restore Procedures

### 4a. Dashboard restore (same project — data corruption / bad migration)

1. Announce downtime; scale the backend to zero if needed
   (`gcloud run services update fractal-backend --min-instances=0 --max-instances=0`).
2. Supabase Dashboard → Database → Backups → choose backup (or PITR point) → Restore.
3. Wait for restore completion; verify with a read-only psql session that the
   expected data is present (`SELECT count(*) FROM users;` and spot-check
   recent rows).
4. Check `alembic_version` matches the deployed code's expected head; if the
   restore predates a migration, run the `migrate-db` Cloud Run job.
5. Restore Cloud Run scale (`--max-instances=1`) and verify `/api/readyz`
   returns 200.

### 4b. Restore into a fresh project (project loss / provider failure)

1. Create a new Supabase project (Postgres 17).
2. Download the latest backup, or use the newest pre-migration dump.
3. `pg_restore --no-owner --no-privileges -d "$NEW_DIRECT_DATABASE_URL" backup.dump`
4. Update Secret Manager: `SUPABASE_DATABASE_URL` and
   `SUPABASE_DIRECT_DATABASE_URL` with the new project's connection strings.
5. Redeploy (or restart) the backend so it picks up the new secrets; verify
   `/api/readyz` and log in with a test account.

### 4c. Local restore drill (no production risk)

`scripts/sync_postgres_to_local.sh` already implements dump-and-restore from a
remote Postgres into local dev (it writes a `backups/postgres-sync/` safety
dump first). Running it against the beta database **is** the restore drill: it
proves credentials, dump, restore, and app-boot-against-restored-data all work.

Drill cadence: quarterly, and once before the first invite wave.

## 5. Pre-Migration Snapshot (required)

Before every production deploy that includes a new Alembic revision:

```bash
pg_dump "$SUPABASE_DIRECT_DATABASE_URL" -Fc -f pre-migrate-$(date +%Y%m%d-%H%M).dump
```

Store the dump somewhere private and durable (not the repo). Delete dumps
older than 30 days — they contain user data.

This step is mandatory in `docs/planning/BETA_PREFLIGHT.md`. A future
improvement is automating it as a Cloud Build step before the `migrate-db`
job (pg_dump in a `postgres:17` step → `gsutil cp` to a locked-down GCS
bucket); that needs a bucket + Cloud Build service-account
`secretmanager.secretAccessor` grant, and is deliberately deferred until the
manual step becomes a burden.

## 6. Verification Log

| Date | Operator | Backups verified | PITR | Drill performed | Result / notes |
| --- | --- | --- | --- | --- | --- |
| _fill in during preflight_ | | | | | |
