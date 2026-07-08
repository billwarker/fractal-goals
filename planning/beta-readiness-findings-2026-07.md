# Beta Readiness Findings — July 2026

## Summary

Current readiness: **A- implementation foundation, B+ beta-launch readiness**.

Fractal Goals is now materially closer to a private beta. The biggest account-lifecycle gap,
outbound transactional email, has been closed with a Resend-backed email service, password reset,
admin beta invite emails, delivery audit rows, webhook ingestion, frontend screens, migrations,
and targeted tests.

The remaining beta risk is now mostly operational rather than architectural. I would not call the
app S+ beta-ready until deploy-time email configuration, DB-aware readiness, backup/restore
verification, and a repeatable beta preflight gate are finished.

## Current Strengths

- Auth posture is strong for a private beta: JWT cookies, CSRF protection, production security
  assertions, rate limiting, secure cookie checks, account management, admin roles, and invite-key
  gated signup all exist.
- The beta signup pipeline is real: public capture, admin triage, invite-key creation, invite email
  sending, invite audit fields, and admin status visibility are present.
- Transactional email is now a strong subsystem: provider-neutral service boundary, Resend transport,
  deterministic test transport, backend-owned templates, persisted delivery events, webhook
  verification, idempotent webhook storage, and no raw reset-token/invite-key/body/API-key logging.
- Email-touching surfaces now have layered abuse controls: route-specific limits count malformed
  password-reset and beta-signup payloads, password reset emails have a per-account cooldown, admin
  beta invites have a per-signup resend cooldown, and Resend webhooks require valid signatures in
  addition to request-rate limits.
- Database posture is solid: Postgres-first configuration, SQLAlchemy models, Alembic migrations,
  and Cloud Build migration jobs are in place.
- The app has meaningful automated coverage and quality tooling across backend, frontend, migrations,
  performance-sensitive paths, and API contracts.
- The current Cloud Run deployment profile is an intentionally constrained private-beta shape:
  single instance, explicit in-memory rate-limit opt-in, and Secret Manager-backed core database/JWT
  configuration.

## Launch-Blocking Findings

### 1. Production deploy must prove Resend email settings are live

Tracked deploy config now wires Resend into the backend Cloud Run service in `cloudbuild.yaml`:

- `EMAIL_PROVIDER=resend`
- `RESEND_EMAIL_API_KEY`
- `RESEND_WEBHOOK_SIGNING_SECRET`
- `EMAIL_FROM`
- `APP_BASE_URL`
- `PUBLIC_MARKETING_URL`

`RESEND_EMAIL_API_KEY` and `RESEND_WEBHOOK_SIGNING_SECRET` are referenced as Secret Manager secrets.

**Impact:** this removes the tracked deploy-config gap, but beta readiness still depends on the
operator confirming both secrets exist, Cloud Run has access to them, and a staging/prod dry run
actually sends email and receives webhooks.

**S+ acceptance:**

- Backend Cloud Run deploy config sets the email env vars and Secret Manager references. **Done in
  tracked config.**
- Secret Manager contains `RESEND_EMAIL_API_KEY` and `RESEND_WEBHOOK_SIGNING_SECRET`.
- The Cloud Run runtime service account can access both secrets.
- `check_production_security` passes in the production container with `EMAIL_PROVIDER=resend`.
- A staging dry run sends one password reset and one beta invite through Resend.
- Resend webhook callbacks update matching `email_delivery_events`.

### 2. No DB-aware readiness probe exists yet

`/health` and `/api/healthz` are static health endpoints. They do not touch Postgres.

**Impact:** Cloud Run can route traffic to an instance that appears healthy while the app cannot
reach the database.

**S+ acceptance:**

- Add `GET /api/readyz` that runs a cheap `SELECT 1` against the configured database.
- Return `200` only when the database check succeeds; return `503` on database failure.
- Keep `/api/healthz` as cheap liveness.
- Wire Cloud Run readiness/startup health behavior to the DB-aware endpoint where supported.
- Add integration tests for success and database-error behavior.

### 3. Backup and restore verification is still missing

The beta plan calls for `docs/architecture/BACKUP_RESTORE_RUNBOOK.md`, Supabase backup/PITR
confirmation, and RPO/RTO notes. That runbook is not present yet.

**Impact:** once real users are invited, unrecoverable beta data loss becomes a trust and support
failure, not just an engineering failure.

**S+ acceptance:**

- Confirm the beta Supabase project backup/PITR settings in the dashboard.
- Document backup frequency, retention, expected RPO/RTO, and restore steps.
- Record who verified the settings and on what date.
- Add a pre-migration safety note for the Cloud Build `migrate-db` job.
- Perform or document a restore drill against a non-production database.

### 4. Beta preflight checklist is not committed yet

The repo has a plan for `docs/planning/BETA_PREFLIGHT.md`, but the checklist itself does not exist.

**Impact:** release readiness depends on memory instead of a repeatable gate. That is fine for local
development, but not for inviting real users.

**S+ acceptance:**

- Add a beta preflight checklist covering production env vars, Secret Manager bindings, Resend,
  invite flow, password reset, webhook receipt, Sentry, rate limits, quotas, readiness, migrations,
  backup status, and full test results.
- Record one staging dry run against the checklist before user invites go out.

## Important Non-Blocking Findings

### 5. Admin force-password-change is only an account marker

`index.md` correctly notes that admin force-password-change is not enforced as a login-time gate.

**Impact:** acceptable if beta onboarding relies on invite links instead of temporary passwords, but
risky if admins ever issue temporary credentials.

**S+ acceptance:**

- Enforce password-change-required state after login, before normal app usage.
- Or remove/hide the admin action until enforcement exists.
- Cover the behavior with backend and frontend tests.

### 6. Email verification is still deferred

Invite-gated private beta makes signup email verification less urgent, especially because beta
invite email delivery now proves reachability for invited users. Still, a user can later change
their account email without a full verification lifecycle.

**Impact:** not a private-beta blocker, but a public-launch blocker.

**S+ acceptance:**

- Add verification for new signup emails and email-change flows.
- Keep old email active until the new address is verified.
- Add confirmation emails for security-sensitive account changes.

### 7. Observability is good but not yet S+ operational visibility

Sentry, response-time logging, email delivery events, explicit slow-request logs, and rate-limit
logs exist. The app does not yet have a metrics exporter or full business counters for beta
operations.

**Impact:** acceptable for small private beta, but support/debugging will lean on logs and database
inspection.

**S+ acceptance:**

- Add greppable counters/log events for auth failures, invite sends, password reset requests,
  quota denials, 5xx responses, webhook failures, rate-limit hits, and beta signup lifecycle changes.
- Later public launch should add metrics through Prometheus/OpenTelemetry or managed equivalents.

### 8. Billing and public SaaS systems remain deferred

Stripe, customer portal, billing webhooks, quota warning emails, and paid-customer support tooling
are not complete.

**Impact:** not a private-beta blocker if the beta is free/invite-only. It is a public-launch blocker.

**S+ acceptance:**

- Wire Stripe subscription/customer lifecycle into quota/account state.
- Add billing webhooks, customer portal, billing notices, and quota warning emails.
- Add admin support views for paid-customer operations.

### 9. Private-beta rate limiting is intentionally single-instance

The current production profile uses `RATELIMIT_STORAGE_URI=memory://`,
`ALLOW_IN_MEMORY_RATELIMIT=true`, `WEB_CONCURRENCY=1`, and Cloud Run `--max-instances=1`.

**Impact:** acceptable for budget private beta, but it trades scale and availability for simplicity.

**S+ acceptance:**

- Switch to Redis-compatible shared rate-limit storage.
- Remove the single-instance constraint.
- Validate rate limits under multi-instance load.

## Readiness Matrix

Updated 2026-07-07 after the S-rank hardening pass (see Addendum below).
Grades marked "S pending ops proof" have all code/docs landed; the grade
converts to S when the operator completes the corresponding
`docs/planning/BETA_PREFLIGHT.md` items in production.

| Area | Current Grade | Beta Interpretation |
| --- | --- | --- |
| Core architecture | S | Hardened request pipeline: JSON 429 handler, 5xx ops events, DB-aware readiness, ops-log seam — all inside existing patterns |
| Auth and account security | S | Force-password-change enforced end-to-end (login flag, API gate, blocking modal, clear-on-change) plus password/email-change security notice emails |
| Email lifecycle | S pending ops proof | Invite-email binding landed (45a98d1); security notices added; deploy wiring tracked — remaining proof is the preflight Resend dry run |
| Beta signup/admin ops | S | Signup lifecycle ops events, invite send/failure events, email-health panel, usage dashboard, committed preflight gate |
| Data safety | S pending ops proof | BACKUP_RESTORE_RUNBOOK.md committed with RPO/RTO, restore procedures, mandatory pre-migration snapshot; needs the operator's backup verification + drill row |
| Deployment health | S pending ops proof | /api/readyz (SELECT 1, 503 on DB failure, limiter-exempt) with tests; Cloud Run startup/liveness probes in cloudbuild.yaml; needs one deploy to confirm probes green |
| Observability | S | Greppable ops_event log contract, JSON+logged 429s, 5xx events, first-party product telemetry (product_events), admin usage dashboard (DAU/WAU/MAU, per-user, top pages, email health) |
| Billing/public SaaS | Deferred | Not required for free private beta (explicitly skipped) |
| Documentation | S | Runbook + preflight committed alongside existing ADRs/index; index.md updated |

## Recommended S+ Beta Sequence

1. Confirm Resend production secrets exist, deploy the tracked Cloud Build / Cloud Run email config,
   and run a real send/webhook dry run.
2. Add `/api/readyz` with database checking, tests, and deploy health configuration.
3. Create `docs/architecture/BACKUP_RESTORE_RUNBOOK.md` and verify Supabase backup settings.
4. Create `docs/planning/BETA_PREFLIGHT.md` and record a staging dry run.
5. Enforce or remove admin force-password-change before admins use temporary passwords.
6. Run the full backend and frontend suites after deploy configuration is finalized.
7. Send real staging password reset and beta invite emails, then verify Resend webhook delivery
   updates the stored delivery events.

## S+ Audit

The implementation is no longer blocked by core product shape. It is blocked by operational proof:
the app needs to prove it can send email in production, refuse traffic when the database is down,
recover beta data after operator error or provider failure, and repeat the same preflight every time
new users are invited.

Distance to S+: **moderate and concrete**. The remaining work is small compared with the already
landed account, admin, and email infrastructure, but it is high leverage because it turns a strong
application into an actually operable beta.

## Addendum — 2026-07-07 S-Rank Hardening Pass

Implemented per `planning/beta-readiness-s-rank-plan-2026-07.md`:

1. **Deployment health**: `blueprints/health_api.py` adds `GET /api/readyz`
   (DB `SELECT 1`, 503 on failure, no error leakage); all health routes are
   `@limiter.exempt`; `cloudbuild.yaml` wires `--startup-probe` (readyz) and
   `--liveness-probe` (healthz); `tests/integration/test_health_api.py`.
2. **Auth**: force-password-change enforced in `token_required` (evaluated on
   the authenticated account before the admin-support id swap; exempt: me,
   csrf, password change), `must_change_password` in `serialize_user`, flag
   cleared by both self-service change paths (`services/account_flags.py`),
   blocking `ForcePasswordChangeModal` in the app shell; security notice
   emails on password change (both paths) and email change (to the OLD
   address) via `services/email_templates/security_notice.py`.
3. **Ops log events**: `services/ops_log.py` (`ops_event=` grep contract) with
   call sites in auth, admin invite send, beta signup lifecycle, quota denials,
   Resend webhook rejection, JSON 429 handler (`blueprints/error_handlers.py`),
   and 5xx after-request logging.
4. **Product telemetry**: `product_events` table (migration `4c5d6e7f8a9b`),
   allowlisted batched `POST /api/telemetry/events`, frontend beacon
   (`client/src/utils/telemetry.js` + `usePageViewTelemetry`, DNT-aware,
   normalized paths), retention prune.
5. **Admin usage dashboard**: `services/admin_usage_service.py`,
   `GET /api/admin/usage` + prune endpoint, rendered in the Admin `overview`
   tab with DAU strip, per-user activity, top pages/events, email delivery
   health.
6. **Data safety / docs**: `docs/architecture/BACKUP_RESTORE_RUNBOOK.md` and
   `docs/planning/BETA_PREFLIGHT.md`; automated pre-migration Cloud Build dump
   documented but deferred (manual snapshot is a mandatory preflight step).

Remaining to convert "S pending ops proof" to S: run the preflight against
production (probes green, Resend dry run with webhook confirmation, backup
verification + restore drill rows).

## Suggested Commit Message

`Document beta readiness findings and S+ launch gaps`
