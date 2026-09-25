# Production S-Rank Hardening — Private Beta (2026-09)

## Context

The production-quality review on 2026-09-24 rated the codebase **A− (82/100)**. The engineering
discipline is excellent, but five things hold it back:

- **Rate limiting.** Every request reaches Flask through the nginx frontend and Cloud Run, and there
  is no `ProxyFix`. All users probably share one rate-limit bucket: 10 logins per minute and
  500 requests per hour, across everyone.
- **Sessions cannot be revoked.** A logged-in session (JWT) is never invalidated. Logging out,
  changing the password or an admin reset leaves it valid, and a refresh accepts a token up to
  7 days after it expires, so a stolen token can be renewed indefinitely.
- **`main` is red.** One agent-harness test depends on the day it runs. It fails whenever today + 60
  days falls on Monday, Wednesday or Friday, about 3 days in 7.
- **No static type checking** across about 140k lines. There is no mypy or pyright, and the frontend
  has zero TypeScript files.
- **Six backend modules exceed 1,000 lines.** The maintainability gate stops them growing but not
  shrinking. There is also cleanup debt: 58 obsolete SQLite-era scripts, a single-stage Docker
  image and 38 `except Exception` blocks.

**Constraints:** the product stays in private beta. Redis and multiple instances are out of scope,
so the in-memory rate limiter on one instance stays. You chose the six-module backend split and the
baseline-plus-ratchet approach to type checking.

## Grade of the existing codebase against this plan

| Area | Grade now | Why | Target |
|---|---|---|---|
| Architecture and domain boundaries | A+ | Clean route → validation → service → serializer layering, which the code follows | S |
| Testing and CI | A+ | About 2,300 tests, query budgets, a restore drill, browser tests, with one date-dependent test red | S |
| Security | B | Global rate-limit bucket, sessions that can't be revoked, user and agent tokens signed with the same key and no audience separation | S |
| Operations (single instance) | B− | Proxy chain not configured; logs can't show the forwarded chain; build tools shipped in the runtime image | A+ (S requires Redis and more instances, deliberately deferred) |
| Maintainability | B+ | No types; 6 modules over 1,000 lines; 38 broad catches | S |
| Docs and process | S | ADRs, runbooks, a current index.md | S |
| **Overall** | **A− (82)** | | **S (≈95); S+ requires Redis and multiple instances** |

---

## Workstream 1 — Rate limiting that identifies real clients (P0)

**Design:** only trust the forwarded chain when the request provably came through our nginx.

1. **New module `request_identity.py`** at the repo root, next to `extensions.py`:
   - `TrustedProxyMiddleware(wsgi_app, hops, secret)` is a WSGI wrapper. It checks
     `X-Fractal-Proxy-Token` with `hmac.compare_digest`.
     - Token matches: delegate to `werkzeug.middleware.proxy_fix.ProxyFix(x_for=hops, x_proto=1)`.
     - Otherwise, including direct calls to the public backend URL: pass the request through
       unchanged. A forged `X-Forwarded-For` is then never trusted.
   - `configure_request_identity(app)` wraps `app.wsgi_app` using config.
2. **Config** ([config.py](config.py)):
   - Add `TRUSTED_PROXY_HOPS` (int, default 0 = disabled) and `TRUSTED_PROXY_SECRET`.
   - In `check_production_security()`, require both in production, with the secret at least 32 bytes.
3. **Wiring:**
   - Call `configure_request_identity(app)` in [app.py](app.py).
   - Also call it from the `test_app` fixture in [tests/conftest.py:134](tests/conftest.py#L134), so
     tests run through the same stack as production.
   - [extensions.py](extensions.py) keeps `get_remote_address`, which now sees the real client.
4. **nginx** ([client/nginx.conf](client/nginx.conf)): in both `/api/` locations, add
   `proxy_set_header X-Fractal-Proxy-Token "${TRUSTED_PROXY_SECRET}";`. The existing
   `/etc/nginx/templates` envsubst renders it. `proxy_set_header` overwrites any value a client sends.
5. **Deploy config** ([cloudbuild.yaml](cloudbuild.yaml)):
   - Add `TRUSTED_PROXY_SECRET` from Secret Manager to both services.
   - Add `TRUSTED_PROXY_HOPS=3` to the backend: client, then nginx's internal address, then nginx's
     egress seen by the backend's front end. It is confirmed in the rollout below. A value that is
     too low only lands on an infrastructure IP, which is safe (today's behaviour). Only a value
     that is too high could pick a client-forged entry.
6. **Tests** (`tests/unit/test_request_identity.py`, plus the existing
   [test_security_hardening.py](tests/integration/test_security_hardening.py)):
   - Correct token → the real client IP is used.
   - Missing or wrong token → `remote_addr` is unchanged, even with a forged `X-Forwarded-For`.
   - Chain shorter than `hops` → unchanged.
   - Two clients behind the proxy get separate login buckets; the 11th login from one IP gets 429
     while another IP still succeeds.
   - Production config check rejects a missing hop count or secret.

## Workstream 2 — Revocable sessions (P1)

1. **Migration** `add_user_session_version` (`down_revision = "e1f3a5b7c9d2"`, the current head):
   - Add `users.session_version INTEGER NOT NULL server_default 0`.
   - Declare it in [models/user.py](models/user.py) as `Mapped[int] = mapped_column(...)`, so new
     code is clean under the type checker.
2. **Token claims** ([services/auth_service.py:29](services/auth_service.py#L29), `issue_token`):
   - Add `aud="fractal:session"`, `sv=user.session_version`, `iat` and `auth_time` (the original
     login time, carried unchanged through refreshes).
   - The signature changes to take the user, or `(user_id, session_version, auth_time)`.
3. **Validation** in `get_current_user_for_token`:
   - Decode with `audience="fractal:session"`. That rejects agent tokens (`aud=INTERNAL_TOKEN_AUDIENCE`)
     and legacy tokens.
   - Reject when `sv != user.session_version`.
4. **Refresh** (`refresh_token`, [auth_service.py:267](services/auth_service.py#L267)):
   - Same audience and version checks.
   - Add an absolute lifetime `SESSION_MAX_LIFETIME_DAYS` (config, default 30): a refresh past
     `auth_time + max` returns 401.
   - The new token keeps the same `auth_time` and version. Refreshes can no longer be chained forever.
5. **One helper, `revoke_user_sessions(user)`**, increments `session_version`. Call it inside the same
   transaction in:
   - `UserService.update_password` ([user_service.py:500](services/user_service.py#L500))
   - `AuthService.reset_password` ([auth_service.py:231](services/auth_service.py#L231))
   - `AdminService.generate_temporary_password` and `soft_delete_user`
     ([admin_service.py:410](services/admin_service.py#L410), [:437](services/admin_service.py#L437))
6. **New endpoint** `POST /api/auth/sessions/revoke` ("sign out everywhere"): token required, CSRF
   checked, limited to 5 per minute. It revokes, clears the auth cookie and logs
   `auth.sessions_revoked` to the ops log. A plain `/logout` still ends only the current device.
7. **Frontend:**
   - [authApi.js](client/src/utils/api/authApi.js): add `revokeAllSessions`.
   - [useAccountSettings.js](client/src/hooks/useAccountSettings.js): add a handler with a
     confirmation step that then runs the existing `logout` from
     [AuthContext.jsx](client/src/contexts/AuthContext.jsx).
   - [SettingsModal.jsx](client/src/components/modals/SettingsModal.jsx): add a "Sign out of all
     devices" row after Change Password.
   - A revoked token's 401 triggers a refresh, which also returns 401, which goes through the
     existing `dispatchSessionExpired` path ([core.js:199](client/src/utils/api/core.js#L199)). No new
     client plumbing is needed.
8. **Rollout note:** existing beta tokens lack `aud`, so each tester logs in once more after deploy.
   This is intentional and simpler than a compatibility path.
9. **Tests:**
   - Each revocation trigger invalidates both the old token and a refresh of it.
   - Nearby cases:
     - a token whose version equals the current one works; one version behind fails
     - an agent internal token is rejected by `token_required`
     - refresh just inside and just outside the absolute lifetime
     - legacy tokens without `aud` are rejected
   - Client tests for the settings action and the session-expired flow.

## Workstream 3 — Make the date-dependent test deterministic (P1)

- In [test_agent_harness_service.py:455](tests/unit/test_agent_harness_service.py#L455), derive a
  **Tuesday** at least 60 days out, a weekday that isn't in the Monday/Wednesday/Friday recurrence.
- Add a neighbouring test: `schedule_program_day` on a date that already recurs returns
  `AgentHarnessError(validation_failed)`, and the proposal writes nothing. This keeps the current
  product behaviour: explicit error, no silent no-op.
- Check `grep -rn "date.today() +" tests`. Pin any test that combines a relative date with weekday
  recurrence in the same way.

## Workstream 4 — Static type checking with a ratchet (P2)

**Backend:**
- Pin `basedpyright` in [requirements-test.txt](requirements-test.txt).
- `pyrightconfig.json`:
  - `typeCheckingMode: "standard"`, Python 3.12
  - `include`: `services`, `blueprints`, `models`, `validators`, `app.py`, `config.py`,
    `extensions.py`, `request_identity.py`, `account_tiers.py`
  - `exclude`: tests, migrations, the venv
- Generate `.basedpyright/baseline.json` **after** Workstream 5, so moved code is recorded at its
  final paths.
- New code from Workstreams 1 and 2 must be clean, not added to the baseline.
- Hook it into `./run-tests.sh typecheck`, include it in `lint`, and add a Backend CI step.
- CI fails on any error not in the baseline. basedpyright drops fixed entries from the baseline as
  they're fixed, so it only shrinks.

**Frontend:**
- Add the `typescript` dev dependency and `client/tsconfig.typecheck.json` (`allowJs`, `checkJs`,
  `noEmit`, `jsx: react-jsx`, `moduleResolution: bundler`, `types: ["vite/client"]`).
- `include`: `src/utils/api/**`, `src/hooks/queryKeys.js`, and the pure view-model or evaluator
  utilities (`programViewModel.js`, `programCalendarStreaks.js`, `programDayState.js`,
  `dateRange.js`, `sessionTime.js`, `durationStats.js`, `progressAggregations.js`), excluding tests.
- Fix every error. Add JSDoc typedefs where they document real API shapes, starting with `core.js`
  and `queryKeys.js`.
- `npm run typecheck`, added to `./run-tests.sh lint` and to Frontend CI.

## Workstream 5 — Split the six backend modules over 1,000 lines (P2)

**How:** follow the existing idiom. Stateful services use `_<domain>_*.py` mixins composed into the
public class, as in [goal_service.py:28-46](services/goal_service.py#L28-L46). Function modules keep
a facade that re-exports with an explicit `__all__`.

**Rules:**
- Every step only moves code: no logic edits.
- One commit per module, reviewable with `git diff --color-moved`.
- Public import paths are unchanged.
- The two tests that patch internals are updated to point at the owning module:
  - `services.completion_handlers._get_db_session` stays in the facade.
  - `services.session_lifecycle_service.event_bus` is re-pointed to where the event is emitted.

| Module (lines) | New files | Facade keeps |
|---|---|---|
| `landing_publish_service.py` (1,563) | `_landing_settings.py` (settings, options, normalisers), `_landing_public_tree.py` (public target and tree serialisation, history, flow tree), `_landing_showcase.py` (goal content, showcase, analytics views and instances), `_landing_static_snapshot.py` (GCS write, restore, delete) | Lock and publish orchestration; `_publish_landing_examples_locked` split into named phase methods |
| `progress_service.py` (1,390) | `_progress_instances.py` (instance query, tags, inclusion), `_progress_config.py` (settings, aggregation, direction), `_progress_sets.py` (best set, set comparisons, value extraction), `_progress_aggregation.py` (auto aggregation, yield), `_progress_comparisons.py` (comparison building, summaries) | Public `compute_*` and `get_progress_*` API |
| `analytics_engine.py` (1,344) | `_analytics_catalog.py` (field and dataset types, policies, field builders), `_analytics_datasets.py` (the dataset declarations, grouped by domain), `_analytics_query_spec.py` (spec normalisation), `_analytics_execution.py` (execute, SQL, CTE, filters, measures, suggestions) | `AnalyticsEngineService` profiles and the public functions |
| `serializers.py` (1,284) | `_serialize_common.py`, `_serialize_activities.py`, `_serialize_sessions.py`, `_serialize_goals_programs.py`, `_serialize_notes_misc.py` | Re-export facade with `__all__` |
| `session_lifecycle_service.py` (1,102) | `_session_goal_scope.py` (preview, replace, insert values, paused duration), `_session_creation.py` (`create_session` split into named steps, plus the quick session), `_session_updates.py` (update, delete, duplicate) | Class composition, `get_active_session` |
| `completion_handlers.py` (1,062) | `_completion_context.py` (event queue, live progress, achievement context), `_completion_targets.py` (threshold, sum, frequency, complex evaluation and revert), `_completion_programs.py` (goal cascade, program progress) | Event handlers, `init_completion_handlers`, `_get_db_session` |

**Afterwards**, in [scripts/check_backend_maintainability.py](scripts/check_backend_maintainability.py):
- Remove all six entries from `SIZE_BACKLOG`, so the default 800-line cap applies to every new file.
- Tighten the remaining five entries to their current sizes.

## Workstream 6 — Cleanup (P3)

- **Delete `python-scripts/`** (58 files): SQLite-era migrations and table-recreation scripts that
  predate Alembic. Git history keeps them. Remove the only references (its own README and planning
  notes).
- **`.env.testing`:** keep it tracked. CI and `tests/test_env.py` load it, and it only holds a
  localhost test URL. Resolve the contradiction instead:
  - Add `!.env.testing` with a comment in [.gitignore](.gitignore).
  - Add a unit test asserting it targets only `localhost`/`127.0.0.1` and has no `*_KEY`, `*_SECRET`
    or `*_TOKEN` entries.
  - This replaces my earlier "untrack it" advice, which would break CI.
- **[Dockerfile](Dockerfile):**
  - Split into two stages: build wheels with `build-essential` and `libpq-dev`; the runtime stage is
    `python:3.12-slim` plus `libpq5`, installed from the wheels.
  - Change gunicorn's `--access-logformat` to include `%({x-forwarded-for}i)s`, needed to confirm the
    proxy hop count.
  - CI's image build and `pip check` already cover it.
- **Broad exceptions (38):**
  - Review each one. Narrow it to the specific exceptions where they're known: JSON, GCS/HTTP, email
    provider, `SQLAlchemyError`.
  - Keep `except Exception` only at real containment boundaries (event handlers, background workers,
    best-effort notices), each with `logger.exception` and a one-line reason.
  - Lower `MAX_BROAD_CATCHES` to the resulting count. Target ≤ 20. The largest groups are
    `completion_handlers` (7) and `landing_publish_service` (6), which Workstream 5 moves anyway.

## Workstream 7 — Docs

- **[index.md](index.md):**
  - Add request-identity and session-revocation invariants under "SaaS and operations".
  - Add `typecheck` to "Testing and quality".
  - Update the repository map for the new private modules.
- **[BACKUP_RESTORE_RUNBOOK](docs/architecture/BACKUP_RESTORE_RUNBOOK.md) or a short new
  `docs/architecture/PROXY_AND_SESSIONS_RUNBOOK.md`:** how to rotate `TRUSTED_PROXY_SECRET`, check
  the hop count from the access logs, and revoke a user's sessions.
- **Plan and audit files:**
  - Save this plan as `planning/production-s-rank-hardening-2026-09.md`.
  - Add a dated addendum to
    [production-quality-audit-2026-09-07.md](planning/production-quality-audit-2026-09-07.md) with
    the new grade.

## Order of work

WS3 (turn `main` green) → WS1 → WS2 → WS5 (one module at a time, full suite after each) → WS6 →
WS4 (baseline last, once code positions are stable) → WS7.

## Verification

- `./run-tests.sh all`: full backend and frontend suites green, including query budgets. Run it
  after each WS5 module split, not only at the end.
- `./run-tests.sh lint`, including the new `typecheck`, `python scripts/check_backend_maintainability.py`
  and `npm run check:maintainability`.
- Migration: run `alembic upgrade head`, then `downgrade -1`, then `upgrade head` against the test
  database. CI's reversibility step also covers it.
- `docker build .` for both images, `pip check` in the backend image, and confirm `gcc` is absent
  from the runtime stage.
- Manual check on the local stack:
  - Log in on two browsers, "Sign out of all devices" in one: the other hits session-expired on its
    next request.
  - A password change does the same.
  - `curl` login 11 times with a forged `X-Forwarded-For` and no proxy token: the 11th gets 429,
    because forging doesn't change the key.
  - With the correct token and different forwarded client IPs, each client gets its own bucket.
- Production rollout:
  1. Create the `TRUSTED_PROXY_SECRET` secret.
  2. Deploy both services.
  3. Read one backend access-log line to confirm the `X-Forwarded-For` chain length matches
     `TRUSTED_PROXY_HOPS=3`, and adjust if not.
  4. Confirm testers can log in again after the one-time re-login.

## Out of scope (recorded for follow-up)

- Redis rate-limit storage and more than one instance (the S+ requirement).
- Splitting the large frontend pages (`Admin.jsx`, `ProgramCalendarPage.jsx`, `FractalGoals.jsx`).
- Migrating models to SQLAlchemy `Mapped[]`, which would remove most baseline type errors.
- Protecting accounts from deliberate lockout, since attackers can lock an account today.

---

## Delivery record — 2026-09-24

Branch `production-s-rank-hardening`, 13 commits. All workstreams delivered.

### Verification

- Backend: **1,100 passed**, plus the new revocation, proxy and error-handler tests. Coverage is
  **81.16%**; the gate is 80%.
  Frontend: **279 files / 1,264 tests passed**. MCP adapter: **7 passed**.
- `./run-tests.sh lint` is green, which covers ESLint, the frontend and backend maintainability
  gates, basedpyright (0 new errors against a 1,234-error baseline) and `tsc` (0 errors).
- Migration `a4c6e8f0b2d5` passes upgrade → check → downgrade → upgrade → check on a scratch
  database.
- The production image builds and passes `pip check`. Gunicorn is 26.2.0, native extensions
  import, and there is **no compiler in the runtime image** (345 MB).
- Every WS5 split was checked line for line: each moved line exists verbatim in the original,
  and each module has an acyclic import graph.

### Where delivery differs from the plan

- **Password change** revokes every *other* session and reissues a token for the device that
  made the change, rather than signing everyone out. Before this, the client cleared the cookie
  but kept an in-memory token, so the user was signed out only on reload.
- **App-level JSON 500 handlers** for `SQLAlchemyError` and unexpected exceptions were added.
  The new endpoint needs no per-route rollback boilerplate, and three ad-hoc route catches were
  removed.
- **AdminService** also lost its beta-signup queue and pure helpers (move-only), because the
  revocation calls would otherwise have pushed it past its no-growth cap.
- **`create_session` and `_publish_landing_examples_locked`** were split into named phases
  (extract-method, same statement order). Two missing failure-path tests were added:
  compressed-size 413 and static-delivery 503.
- **TypeScript 7** enables `strict` by default. The client check sets `strict: false`, as
  intended for incremental `checkJs`. The 28 remaining findings were typing gaps, not live bugs.
  Optional `timezone` and `attachedGoalIds` are now documented as optional.
- **`./run-tests.sh agent-adapter`** now sets the same `AGENT_*` variables as CI. Before, the
  local `all` run failed one adapter test, and it did so on `main` too.

### Rollout (operator)

1. Create the `TRUSTED_PROXY_SECRET` secret, then deploy
   ([runbook](../docs/architecture/PROXY_AND_SESSIONS_RUNBOOK.md)).
2. Confirm `TRUSTED_PROXY_HOPS=3` from one `xff="..."` access-log line.
3. Beta testers log in once, because legacy tokens lack the session claims.

### Known issues and follow-ups

- **Pre-existing, blocks release:** three Playwright workflows fail identically on `main`:
  - AI handoff dialog (desktop and mobile)
  - desktop bulk program-day "3 selected"

  Fix them before relying on the browser CI gate.
- Give mixins a typed host (for example `self: "SessionLifecycleService"`), and migrate
  models to SQLAlchemy `Mapped[]`. Together these account for most of the 1,234 baselined
  errors.
- Redis rate-limit storage and more than one instance (S+).
- Split the large frontend pages.
- Protect accounts from deliberate lockout by attackers.
