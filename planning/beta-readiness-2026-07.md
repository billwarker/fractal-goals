# Beta Readiness Plan — Fractal Goals Private Beta

> Goal: close the gaps that block inviting real users into a private beta, without
> over-building for public launch. Original scope: **beta-blockers only** + **real email
> password reset**. S+ / scale items are catalogued and explicitly deferred.
>
> **AUDIT UPDATE — 2026-07-08.** Every work item in this plan has been implemented,
> and three follow-on hardening passes landed beyond it (S-rank pass `30bf66f`,
> usage/telemetry v2 + BigQuery export `36b5d39`…`74f4367`). What separates the app
> from invites is no longer code: it is a short list of operator actions recorded
> in `docs/planning/BETA_PREFLIGHT.md`. Statuses and grades below reflect the
> audited repo state at commit `74f4367`.

---

## Current-state grade against this plan (audited 2026-07-08)

**Overall: A (93/100) — invite-ready once the preflight dry run is recorded.**

| Aspect | Was (plan) | Now | Grade | What changed |
|--------|:----:|----:|:-----:|--------------|
| Architecture & code quality | 92 A | 94 | A | Health routes moved to a testable blueprint, admin usage decomposed into its own service, shared `app_settings`/`dateRange` helpers extracted, JSON 429 handler |
| Testing coverage | 85 A− | 92 | A | 37 integration files / 219 frontend test dirs; new suites for health, telemetry, usage, retention, logs gating, export watermarks; two long-dead broken test files repaired |
| Security & auth | 84 B+ | 92 | A | Force-password-change enforced end-to-end, invite keys email-bound, security-notice emails (old-address on email change), admin-gated log clearing, analytics SQL runs in `SET LOCAL default_transaction_read_only` + rate limit |
| Account lifecycle / product completeness | 62 D+ | 90 | A− | Email transport + reset + invite emails + security notices all live; email verification remains the deliberate public-launch gap |
| Error handling & resilience | 80 B | 90 | A− | `/api/readyz` DB probe wired to Cloud Run startup probe, liveness stays DB-free, JSON 429s with `Retry-After`, 5xx ops events |
| Observability | 68 C+ | 95 | S | Greppable `ops_event=` contract, first-party product telemetry, admin usage dashboard (DAU chart, per-user activity, full ~45-type event breakdown, storage panel), nightly BigQuery export |
| Performance & scalability | 78 B | 78 | B | Unchanged by design — single-instance in-memory rate-limit profile is a documented beta trade-off |
| DevOps / deploy / data safety | 70 C+ | 88 | A− | Probes in `cloudbuild.yaml`, backup/restore runbook, export job, global event indexes; **S blocked only on operator verification rows** |
| Documentation | 96 S | 96 | S | Runbook, preflight, BigQuery setup doc, index.md kept in sync |

Scoring note: the three A− rows share one root cause — the operational proof
(§ "Remaining before invites") has not been executed and recorded yet. No further
engineering is required to convert them.

---

## Phase 1 — MUST FIX before inviting users — ALL IMPLEMENTED

### WI-1 — Email transport service — ✅ DONE
`services/email_service.py` with `EMAIL_PROVIDER=test|disabled|resend`, backend-owned
templates in `services/email_templates/`, `email_delivery_events` audit rows, idempotent
signature-verified Resend webhook ingestion at `POST /api/public/webhooks/resend`, and
`check_production_security` asserting the full Resend config in production. Since the
original implementation it also gained: per-account reset cooldowns, admin invite resend
cooldowns, rate limits that count malformed payloads, and **security-notice templates**
(password changed; email changed — sent to the OLD address).

### WI-2 — Self-service password reset — ✅ DONE
Hashed single-use `password_reset_tokens`, enumeration-safe `POST /auth/password/forgot`
+ `/reset`, `/reset-password` frontend route, integration coverage for success/single-use/
expiry/unknown-email. Reset completion now also clears any admin force-password-change
flag and sends the password-changed security notice.

### WI-3 — DB-aware readiness probe — ✅ DONE
`blueprints/health_api.py` serves `/health`, `/api/healthz` (static liveness) and
`GET /api/readyz` (`SELECT 1`, 503 on DB failure, no error leakage). All three are
`@limiter.exempt` (probe traffic would otherwise exhaust the default limiter budget).
`cloudbuild.yaml` wires `--startup-probe` → `/api/readyz` and `--liveness-probe` →
`/api/healthz`. Tested including simulated DB failure. **Operator step remaining:** one
deploy to observe the probes green on a live revision.

### WI-4 — Backup / restore verification — ✅ CODE+DOCS DONE, ⚠️ OPERATOR ROWS OPEN
`docs/architecture/BACKUP_RESTORE_RUNBOOK.md` exists: data inventory, RPO 24h / RTO 2h
beta targets, three restore procedures (dashboard restore, fresh-project pg_restore,
local drill via `scripts/sync_postgres_to_local.sh`), mandatory pre-migration `pg_dump`
step, and a verification log. **The dashboard-verification table and drill row are still
`_fill in_` — this is the single oldest open item in the whole plan.**

### WI-5 — Beta pre-flight checklist — ✅ COMMITTED, ⚠️ DRY RUN NOT RECORDED
`docs/planning/BETA_PREFLIGHT.md` covers config/secrets, migrations, probes, the Resend
dry run, force-password-change round trip, Sentry, ops events, rate-limit sanity, accepted
trade-offs, quotas, backups, and full suites. The Dry-Run Record table has no completed row
yet — a wave must not go out until it does.

---

## Phase 2 — Should fix during beta — DONE (and exceeded)

### WI-6 — Light observability pass — ✅ EXCEEDED
The "small greppable counters" ask became a full observability stack:
- `services/ops_log.py`: one-line `ops_event=<name> key=value` contract on the
  `fractal.ops` logger — auth failures, reset lifecycle, invite sends, beta signup
  transitions, quota denials, webhook rejections, rate-limit hits, 5xx.
- **First-party product telemetry**: `product_events` table fed by an authenticated,
  DNT-respecting frontend beacon (allowlist: `page_view`, `settings_opened`; paths
  normalized to `/:rootId/...`). Retention configurable 30–730 days from the admin UI
  with prune; telemetry is excluded from user storage quotas.
- **Admin usage dashboard** (Admin → overview): Chart.js DAU bar chart with axes,
  analytics-parity date-range filter (7D/30D/90D/6M/1Y/custom, shared
  `DateRangeFilter` component with the analytics sidebar), WAU/MAU, per-user activity
  (page views, sessions/goals created, total events), **full domain-event breakdown**
  (every `event_logs` type with domain filter + search), top pages, email delivery
  health, and a database storage breakdown (per-relation table/index/TOAST bytes).
- **BigQuery warehouse export**: `services/analytics_export_service.py` +
  `scripts/export_analytics_to_bigquery.py` run as the `export-analytics` Cloud Run
  job (updated on every deploy, executed nightly by Cloud Scheduler). Incremental
  keyset export with 10-minute lag and per-table watermarks in `app_settings` for
  `product_events`, `event_logs`, `email_delivery_events`, `email_webhook_events`,
  plus a `users` dimension (`WRITE_TRUNCATE`; no password/preference fields).
  Setup + dedupe views documented in `docs/bigquery-export.md`. Export state is
  visible in the admin storage panel.
- **Logs page is now admin-only** (nav hidden + route redirect for non-admins;
  `DELETE /logs/clear` admin-gated server-side). Users keep read access to their own
  `event_logs` dataset through the analytics engine — an intentional, documented
  retention of existing saved-view behavior.

### WI-7 — Account lifecycle polish — ✅ DONE
- Email-change and password-change now send confirmation/security emails (the
  email-change notice goes to the old address, so a hijacked account still alerts
  its owner). Force-password-change is a real gate: `403 password_change_required`
  on non-exempt routes + a blocking frontend modal.
- `DELETE /account` lifecycle covered by tests (success, wrong password, wrong
  confirmation) — anonymizes credentials and deactivates.

---

## Beyond the plan (landed since it was written)

- **S-rank hardening pass** (`30bf66f`): everything in WI-3/5/6 plus quota decoupling
  groundwork; matrix + addendum in `planning/beta-readiness-findings-2026-07.md`.
- **Usage/telemetry v2 + BigQuery** (`36b5d39`…`ebc084d`): everything in WI-6 above;
  plan in `planning/admin-usage-telemetry-v2-plan-2026-07.md`.
- **Analytics API hardening** (`74f4367`): SQL console queries execute under
  `SET LOCAL default_transaction_read_only = on` (defense-in-depth beyond keyword
  rejection) and the run endpoint is rate-limited 20/min.
- **Invite keys bound to emails** (`45a98d1`): admin invites carry `assigned_email`,
  enforced at signup.
- Global `(timestamp, id)` / `(created_at, id)` export indexes on the three event
  tables (migrations `5d6e7f8a9b0c`, `6e7f8a9b0c1d`); `event_logs` no longer counts
  against user storage quotas (admin-owned telemetry now).

---

## Remaining before invites (operator actions only — no code)

Run `docs/planning/BETA_PREFLIGHT.md` top to bottom against production and record it:

1. **Deploy once** and confirm the startup/liveness probes report green on the new
   revision (also proves the `export-analytics` job update step works — the job must
   be `gcloud run jobs create`d before that deploy, per `docs/bigquery-export.md`).
2. **Resend dry run**: real password reset + real beta invite to an operator-owned
   address; webhooks flip both `email_delivery_events` rows to `delivered` (visible
   in Admin → overview → Email delivery).
3. **Backup verification**: fill the runbook §2 table from the Supabase dashboard,
   decide PITR, and perform the §4c restore drill; add the verification-log row.
4. **BigQuery**: confirm the nightly scheduler fired and the admin storage panel
   shows a successful `last_run_at`.
5. **Record the dry run** in the preflight's Dry-Run Record table.

---

## Explicitly DEFERRED (post-beta / public-launch S+)

Unchanged intent, updated for what has since shipped:
- Stripe billing / customer portal / webhooks (untouched, still the largest gap to public launch)
- Email verification on signup + email change (security notices shipped; full verify-before-switch lifecycle deferred — `PasswordResetToken` is the pattern to clone)
- Redis-backed shared rate limiting + multi-instance scale-out (re-affirmed each preflight run as an accepted beta trade-off)
- Background job queue for in-app work (the BigQuery export job covers analytics offload; email/billing/recompute queueing still deferred)
- Prometheus/OTel metrics exporter (ops_event logs + telemetry + BigQuery cover beta; exporter only if log-grepping stops scaling)
- Remaining god-file decomposition backlog (`GoalDetailModal.jsx`, `Admin.jsx` is now the largest page file)

---

## Related documents

- `planning/beta-readiness-findings-2026-07.md` — graded findings + S-rank addendum
- `planning/beta-readiness-s-rank-plan-2026-07.md` — S-rank implementation plan + status
- `planning/admin-usage-telemetry-v2-plan-2026-07.md` — usage/telemetry v2 plan
- `docs/planning/BETA_PREFLIGHT.md` — the release gate (run before every wave)
- `docs/architecture/BACKUP_RESTORE_RUNBOOK.md` — backup posture + restore procedures
- `docs/bigquery-export.md` — warehouse export setup + dedupe views
