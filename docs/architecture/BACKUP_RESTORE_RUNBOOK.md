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
   restore predates a migration, run the `migrate-db` Cloud Run job. Run
   `ANALYZE;` if the provider's restore does not preserve statistics.
5. Restore Cloud Run scale (`--max-instances=1`) and verify `/api/readyz`
   returns 200.

### 4b. Restore into a fresh project (project loss / provider failure)

1. Create a new Supabase project (Postgres 17).
2. Download the latest backup, or use the newest pre-migration dump.
3. `pg_restore --no-owner --no-privileges -d "$NEW_DIRECT_DATABASE_URL" backup.dump`
   then `psql "$NEW_DIRECT_DATABASE_URL" -c 'ANALYZE;'`. A logical restore carries no
   planner statistics; until they exist, goal analytics on a long history can run
   quadratically (about 50 s for 10,000 sessions, measured October 29, 2026).
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

## 5. Pre-Migration Snapshot and Release Gates (automated in `cloudbuild.yaml`)

Every Cloud Build deploy now runs these gates, in order, and stops on the first failure:

1. **Require Passing CI.** `scripts/deploy_gates.py require-ci` confirms the commit's
   `migration-health`, `coverage`, `production-image`, `frontend` and `browser` checks
   all succeeded, so only tested commits are built and deployed.
2. **Pre-Migration Backup.** A `postgres:17` step runs `pg_dump --format=custom`, proves it
   restorable with `pg_restore --list` (including `alembic_version`), and stores it at
   `gs://$PROJECT_ID-premigration-backups/premigration/$BUILD_ID.dump` *before*
   `migrate-db` runs.
3. **Candidate rollout.** Backend and frontend deploy with `--no-traffic --tag candidate`.
   `smoke-backend` checks `/api/readyz`, `/api/healthz` and an anonymous `/api/auth/me`
   (must be 401); `smoke-frontend` checks the shell, its strict `script-src`, the boot
   script, and the API proxy. Only then does `update-traffic --to-latest` promote the
   candidate. A failed smoke leaves traffic on the previous revision. The analytics-export
   and data-retention jobs update only after the backend is promoted.

Migrations stay expand/contract (see the migration policy): the previous revision keeps
serving against the migrated schema until promotion.

### One-time setup (required before the next deploy)

- Secret `GITHUB_CHECKS_TOKEN`: a fine-grained GitHub token with read-only **Checks**
  access to `billwarker/fractal-goals`.
- Bucket `gs://<project-id>-premigration-backups`, private, with an object lifecycle
  rule matching the published retention window (for example, delete after 30 days).
- Cloud Build service account: Secret Manager Secret Accessor (both secrets), Storage
  Object Creator (backup bucket), Cloud Run Admin and Service Account User (already
  needed for deploys).
- `SUPABASE_DIRECT_DATABASE_URL` must be reachable from Cloud Build. If the direct host is
  IPv6-only, point the backup step at the IPv4 session pooler URL instead.

### Proving the gates (do once in a staging trigger)

1. Push a commit whose CI is red, or run the trigger before CI finishes: the build must
   stop at **Require Passing CI** with no image pushed.
2. Temporarily point `smoke-backend` at a path that returns 404: the build must stop at
   **Smoke Backend Candidate** and `gcloud run services describe fractal-backend` must
   still show 100% traffic on the previous revision.
3. Record both results in the Verification Log below.

### Emergency override

`gcloud builds submit --substitutions=_ALLOW_UNVERIFIED_DEPLOY=true` skips only the CI
gate; the build log records the override with the commit and build ID. Backup and smoke
gates cannot be skipped. Record every override in the Verification Log.

### Manual snapshot (outside Cloud Build)

For migrations run by hand, keep the previous practice:
`pg_dump --format=custom "$SUPABASE_DIRECT_DATABASE_URL" -f premigration-$(date +%Y%m%d%H%M).dump`,
then `pg_restore --list` it before migrating.

## 6. Verification Log

| Date | Operator | Backups verified | PITR | Drill performed | Result / notes |
| --- | --- | --- | --- | --- | --- |
| 2026-09-09 | Automated local quality run | N/A — isolated test source | N/A | Logical dump/restore | Passed in 1.91s through `./run-tests.sh restore-drill`; table count and Alembic revision matched; disposable restored database removed. |
| _fill in during preflight_ | | | | | |
