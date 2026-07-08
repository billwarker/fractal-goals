# Beta Preflight Checklist

Repeatable release gate. Run the full checklist before every wave of beta
invites and record the run in the Dry-Run Record at the bottom. A wave does
not go out on memory — it goes out on a dated, completed checklist.

## 1. Configuration & Secrets

- [ ] `cloudbuild.yaml` backend env vars match expectations: `FLASK_ENV=production`,
      `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `APP_BASE_URL`, `PUBLIC_MARKETING_URL`,
      CORS origins, secure cookie flags.
- [ ] Secret Manager contains current values for `SUPABASE_DATABASE_URL`,
      `SUPABASE_DIRECT_DATABASE_URL`, `JWT_SECRET_KEY`, `RESEND_EMAIL_API_KEY`,
      `RESEND_WEBHOOK_SIGNING_SECRET`.
- [ ] Cloud Run runtime service account (`fractal-runtime@...`) has accessor
      rights on all five secrets.
- [ ] The production container booted without `check_production_security`
      errors (it hard-exits on failure — a running latest revision is the proof).

## 2. Database & Migrations

- [ ] Pre-migration snapshot taken per
      `docs/architecture/BACKUP_RESTORE_RUNBOOK.md` §5 (required when the
      deploy includes a new Alembic revision).
- [ ] `migrate-db` Cloud Run job succeeded in the latest build.
- [ ] `alembic_version` in production equals the repo head
      (`python db_migrate.py heads`).

## 3. Deployment Health

- [ ] Latest revision serving 100% traffic; startup probe (`/api/readyz`) and
      liveness probe (`/api/healthz`) configured and green in Cloud Run.
- [ ] `curl https://<backend>/api/readyz` returns `{"status": "ready"}`.
- [ ] `curl https://<backend>/api/healthz` returns `{"status": "ok"}`.
- [ ] Frontend loads at `https://my.fractalgoals.com` and the landing page at
      `https://fractalgoals.com`.

## 4. Email Lifecycle Dry Run (operational proof)

- [ ] Send a real password reset from production to an operator-owned address;
      the email arrives and the reset link works.
- [ ] Send a real beta invite (Admin → beta signups → send invite) to an
      operator-owned address; the email arrives, the invite link prefills
      signup, and signup succeeds with the bound email.
- [ ] Resend webhooks flip both sends' `email_delivery_events` rows to
      `delivered` (check Admin → usage → Email delivery, or the DB).
- [ ] No `ops_event=email.webhook_rejected` lines in logs during the dry run.

## 5. Auth & Account Safety

- [ ] Force-password-change round trip: set a temporary password on a test
      account, log in, confirm the blocking modal + `403 password_change_required`
      on API calls, change the password, confirm normal access resumes.
- [ ] Password-changed and email-changed security notice emails arrive
      (the email-changed notice goes to the OLD address).

## 6. Observability

- [ ] Sentry test event received from backend and frontend (temporarily raise
      an error or use Sentry's test-event button; confirm environment tags).
- [ ] `ops_event=` lines visible in Cloud Run logs
      (`resource.type=cloud_run_revision "ops_event="`).
- [ ] Telemetry flowing: navigate the app as a test user, then Admin → usage
      shows the page views.
- [ ] Rate-limit sanity: exceed a limit (e.g. >5/min on password forgot) and
      confirm a JSON 429 with `code=rate_limited` plus an
      `ops_event=http.rate_limited` log line.

## 7. Accepted Trade-offs (re-affirm each run)

- [ ] **In-memory rate limiting on a single instance** (`RATELIMIT_STORAGE_URI=memory://`,
      `ALLOW_IN_MEMORY_RATELIMIT=true`, `WEB_CONCURRENCY=1`, `--max-instances=1`).
      Accepted for the private beta. **Public-launch gate:** switch to
      Redis-compatible shared storage and lift the single-instance cap.
- [ ] **Email verification deferred** — invite emails prove reachability;
      security notices cover password/email changes. **Public-launch gate:**
      full verification lifecycle for signup and email changes.
- [ ] **Billing deferred** — beta is free/invite-only.

## 8. Quotas & Data Safety

- [ ] Spot-check quotas: a free-tier test account hits its goal/session quota
      and receives a clean 403 quota error (and `ops_event=quota.denied`).
- [ ] Backup verification row added to the runbook Verification Log this month.
- [ ] Restore drill performed at least once (runbook §4c) before the first wave.

## 9. Test Suites

- [ ] `./run-tests.sh backend` green.
- [ ] `./run-tests.sh frontend` green.

## Dry-Run Record

| Date | Operator | Wave / reason | Checklist result | Notes |
| --- | --- | --- | --- | --- |
| _fill in_ | | | | |
