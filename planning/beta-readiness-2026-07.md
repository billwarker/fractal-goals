# Beta Readiness Plan — Fractal Goals Private Beta

> Goal: close the gaps that block inviting real users into a private beta, without
> over-building for public launch. Scope chosen: **beta-blockers only** + **real email
> password reset**. S+ / scale items are catalogued but explicitly deferred.
>
> Written to be executed by other agents. Each work item is self-contained, names its
> files, and has an acceptance check.

---

## Current-state grade against this plan

**Overall: B (82/100) — beta-ready once two must-fix gaps close.**

| Aspect | Now | Grade | S+ target after this plan |
|--------|----:|:-----:|:-------------------------:|
| Architecture & code quality | 92 | A | already S-tier; no work needed |
| Testing coverage | 85 | A− | +new-flow tests |
| Security & auth | 84 | B+ | 95 (A) after reset-token hardening |
| **Account lifecycle / product completeness** | **62** | **D+** | **95 (A) after email + reset** |
| Error handling & resilience | 80 | B | 90 (A−) after readiness probe |
| Observability | 68 | C+ | 78 (B) — light touch only this phase |
| Performance & scalability | 78 | B | unchanged (deferred to public launch) |
| DevOps / deploy / data safety | 70 | C+ | 90 (A−) after health probe + backup verify |
| Documentation | 96 | S | keep in sync |

The codebase already cleared the June audit (P0–P3 landed; P1 god-file decomposition
mostly landed in follow-up commits — see git log). What remains for **beta** is
operational and account-lifecycle completeness, not architecture. Confirmed during review:
57 backend + 149 frontend test files, Sentry wired both ends, error boundaries present,
CSRF + rate limiting + prod security asserts in `config.py`, N+1 batching and latency
budgets in place, zero TODO/FIXME markers in source.

---

## Phase 1 — MUST FIX before inviting users

### WI-1 — Email transport service (foundation for WI-2) — IMPLEMENTED
**Why:** Nothing in the backend can send email today (confirmed: no smtplib/SendGrid/SES/Resend).
Every user-facing lifecycle flow depends on this. **No dependencies — start here.**

- Add `services/email_service.py` with a provider-agnostic `send_email(to, subject, html, text)`
  interface and a single concrete transport. **Recommend Resend** (simplest API, generous free
  tier) behind `EMAIL_PROVIDER` / `RESEND_EMAIL_API_KEY` / `EMAIL_FROM` env vars in `config.py`.
- Dev/test transport = no-op logger that records sent messages (so tests assert on them);
  production fails `check_production_security` when reset is enabled but `RESEND_EMAIL_API_KEY` is unset.
- Add plain-text + minimal HTML templates under `services/email_templates/`.
- **Acceptance:** unit test sends through the no-op transport and asserts recipient/subject/body;
  `check_production_security` raises if prod + reset enabled + no `RESEND_EMAIL_API_KEY`.

Implemented with `services/email_service.py`, `EMAIL_PROVIDER=test|disabled|resend`,
`RESEND_EMAIL_API_KEY`, `RESEND_WEBHOOK_SIGNING_SECRET`, backend-owned templates,
`email_delivery_events` audit rows, and idempotent Resend webhook ingestion through
`POST /api/public/webhooks/resend`.

### WI-2 — Self-service password reset (real email flow) — IMPLEMENTED
**Why:** #1 beta support-ticket generator. Invited users who forget their password are stuck
today (admin-temp-password only, per index.md). **Depends on WI-1.**

- Backend (`blueprints/auth_api.py` + `services/auth_service.py`):
  - `POST /auth/password/forgot` — accepts email, **always returns 200** (no user enumeration),
    mints a single-use, expiring (~60 min) token. Store only a **hash** of the token in a new
    `password_reset_tokens` table (Alembic migration) — never the raw token.
  - `POST /auth/password/reset` — accepts token + new password, validates + consumes the token,
    updates password, invalidates that token and any active sessions/refresh for the user.
  - Rate-limit both endpoints (reuse the existing limiter on `auth_api`).
- Frontend: `ForgotPassword` + `ResetPassword` screens wired into `AuthModal.jsx` / router;
  "Forgot password?" link on the login form; success/error via existing toast system.
- **Acceptance:** integration test covers request → email-captured → reset → login-with-new-password;
  token single-use + expiry enforced; unknown email returns 200 without leaking existence.
- **Split option:** WI-2a (backend + migration) and WI-2b (frontend) if handed to two agents.

Implemented with hashed `password_reset_tokens`, enumeration-safe forgot/reset endpoints,
a `/reset-password` frontend route, and integration coverage for success, single-use, expiry,
and unknown-email behavior.

### WI-3 — DB-aware readiness probe
**Why:** `/health` and `/api/healthz` return static JSON without touching Postgres, so Cloud Run
can route traffic to an instance that can't reach the DB.

- Add `GET /api/readyz` that runs a cheap `SELECT 1` with a short timeout, returns 503 on failure.
- Keep `/api/healthz` as the always-cheap liveness probe.
- Point the Cloud Run **readiness** check at `/api/readyz`, liveness at `/api/healthz`
  (update `cloudbuild.yaml` / service config).
- **Acceptance:** test hits `/api/readyz` green on a live DB; returns 503 when the session errors.

### WI-4 — Verify & document backup / restore for beta data
**Why:** Losing invited-user data is unrecoverable trust damage; no backup verification is visible.

- Confirm Supabase PITR / daily backups are enabled for the beta project; **document the restore
  runbook** in `docs/architecture/BACKUP_RESTORE_RUNBOOK.md` (how to restore, RPO/RTO).
- Add a pre-migration safety note to the deploy runbook (migrations run via `cloudbuild.yaml`
  `migrate-db` job — document taking a snapshot before destructive migrations).
- **Acceptance:** reviewed `BACKUP_RESTORE_RUNBOOK.md`; backup setting owner-confirmed in the
  Supabase dashboard and noted in the doc. (This WI has an owner-verified step, not just code.)

### WI-5 — Beta pre-flight checklist (release gate)
**Why:** One reviewed gate so nothing silent slips through.

- `docs/planning/BETA_PREFLIGHT.md` covering: prod env vars set (JWT secret, CORS, cookie
  secure/samesite, `RESEND_EMAIL_API_KEY`, `RESEND_WEBHOOK_SIGNING_SECRET`), `check_production_security` passes, invite-key flow works
  end-to-end, quota/storage limits sane for beta tier, Sentry receiving from both ends, rate
  limits active, readiness probe wired, full test suite green.
- **Acceptance:** checklist committed; a dry-run staging pass recorded against it.

---

## Phase 2 — Should fix during beta (not launch-blocking)

### WI-6 — Light observability pass
- Add small counters (in logs, no exporter yet) for auth failures, quota-limit hits, and 5xx
  rate, alongside the existing `X-Response-Time-Ms` slow-request logging.
- **Acceptance:** log lines exist and are greppable; documented in index.md.

### WI-7 — Account lifecycle polish
- In-app confirmation UX for email-change / password-change (verify `PUT /account/email` doesn't
  silently change login identity without confirmation).
- Confirm `DELETE /account` self-delete cascades/soft-deletes cleanly, covered by a test.
- **Acceptance:** tests for email-change and account-delete lifecycle.

---

## Explicitly DEFERRED (post-beta / public-launch S+)

Catalogued so they aren't lost; **not in this plan**:
- Stripe billing / customer portal / webhooks
- Background job queue (Celery/RQ) for analytics, email, billing sync, heavy recompute
- Redis-backed shared rate limiting + multi-instance scale-out (remove `WEB_CONCURRENCY=1` /
  `--max-instances=1` beta profile)
- Request/quota/business **metrics exporter** (Prometheus/OTel) beyond logs + Sentry
- Remaining P1 god-file decomposition (`GoalDetailModal.jsx`, `validators.py` package polish)
- Email verification on signup (invite-gated beta makes this low-priority now)

---

## Suggested agent execution order

1. **WI-1** (email service) — foundation, no dependencies.
2. **WI-3** + **WI-4** in parallel (independent ops work) while WI-1 lands.
3. **WI-2** (password reset) — depends on WI-1.
4. **WI-5** (pre-flight) — after 1–4 exist.
5. **WI-6 / WI-7** — during beta.

Each WI is sized for a single focused agent; WI-2 is the largest and may split into 2a/2b.

## Save location
On approval, save this plan to `/planning/beta-readiness-2026-07.md` per CLAUDE.md.
