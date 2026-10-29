# Code quality, production readiness, and security audit — October 28, 2026

## Decision

**Original decision (morning of October 28): release blocked.** An authenticated analytics
endpoint could read outside the tenant-scoped catalog. An isolated API probe returned another
synthetic user's password hash, and the raw SQL path did not make its transaction read-only.

**After remediation (same day, see [Remediation](#remediation--october-28-2026) and
[Rerun](#rerun-after-remediation--october-28-2026)): the security blockers are closed in code
and every confirmed reproduction is now a regression test that is refused.** Production
sign-off still needs the deployment items this repository cannot prove: shipping the fix and
reviewing access logs if raw SQL was ever enabled in production (F1), confirming the production
JWT key meets the new minimum before deploying (F5), and the deployment and operations
evidence in F8–F10.

Qualitative grades are judgments, not certification or an average of test scores:

| Area | Before | After remediation | Remaining distance to S+ |
| --- | --- | --- | --- |
| Architecture and domain ownership | B+ | A- | Compatibility readers still load-bearing (F12 inventory); route boilerplate cap |
| Automated verification | B+ | A | Backend coverage not freshly measured; WebKit engine; keyboard/screen-reader QA |
| Production build discipline | B | B+ | Tested-artifact promotion and image scanning (F8) |
| Application security | Release blocked | A- | Production deployment of fixes; optional least-privilege role; admin MFA |
| Reliability and operations | C+ / evidence incomplete | C+ (unchanged by design) | F8–F10 need live infrastructure; F9 is a deliberate beta choice |
| Performance | B+ at repository level | B+ | Structured analytics now time-bounded; production latency unverified |
| Overall | Below production sign-off | Code-ready; deployment evidence pending | Ship, verify production config, then operational proof |

## Scope and method

Reviewed the current working tree, including existing uncommitted goal/group and instance-link
changes. No application remediation or deployment was performed. Read `index.md`, engineering and
migration policies, CI, containers, Cloud Build, runtime configuration, authentication, proxy identity,
analytics query execution, storage adapters and media streaming, offline persistence, and representative
services and tests. Inspected source for dangerous execution, credential storage, compatibility paths,
and quality-gate coverage. This is a broad, risk-based audit, not a line-by-line review of every file.

Approximate inspected-repository inventory, excluding frontend test files: 197 service modules
(44,408 lines), 40 blueprint modules (8,394 lines), 14 model modules (3,378 lines), 17 validator
modules (3,866 lines), and 762 frontend JS/JSX files (98,510 lines, including test-support files).
There are 150 backend test modules and 414 frontend test files before temporary audit probes.

Security probes used synthetic accounts and separate disposable local PostgreSQL databases.
No production account, credential, or production database was queried. Temporary probes were
removed after recording their results. Advisory registries were checked on the audit date.

## Findings, ordered by priority

### F1 — Critical: raw SQL analytics escapes tenant isolation

Evidence: `blueprints/analytics_api.py:43`, `services/_analytics_query_spec.py:131`,
`services/_analytics_execution.py:95`, `services/_analytics_catalog.py:49`.

`POST /api/analytics/query/run` accepts `mode: sql` for an ordinary authenticated user.
Validation checks the opening keyword, mutation words, comments, semicolons, and three schema
prefixes. It does not restrict referenced relations or functions to the governed catalog.
The execution path prepends scoped CTEs and executes the supplied SQL on the application's
database connection. CTEs shadow only their own table names; they do not prohibit other tables.

**Confirmed through the HTTP API:** a user queried `users` for a second synthetic account and
received its ID and password hash with status 200. The probing user did not need an owned fractal.
Existing tests cover scoped `sessions` and the literal `public.sessions` pattern, which miss this case.

Impact: cross-account disclosure of any readable relation outside the scoped CTEs, including the
account table. Exact production reach depends on runtime database grants/RLS, which were not
inspected; the application necessarily has account-table access for authentication. This is a
confirmed code defect, not evidence that anyone has exploited the deployed service.

Required action: disable raw SQL mode until its security boundary is redesigned. Preserve the
structured query path. Prefer compiling a constrained query language against explicit catalog
relations. If SQL remains, use an isolated least-privilege execution role and a genuine tenant
boundary, with allowlisted parsed relations/functions; a regex blacklist is insufficient. Add tests
for noncatalog relations, quoted schema names, nested queries/CTEs, function calls, cross-user
data, and callers with no roots. Read-only access alone does not prevent disclosure.
This follows OWASP's emphasis on constrained query construction and
[least-privilege database access](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html).

### F2 — High: the analytics read-only defense does not protect the current transaction

Evidence: `services/_analytics_execution.py:105`.

The service executes `SET LOCAL default_transaction_read_only = on` after database work has
already started the transaction. That changes the default used for subsequent transactions;
it does not set the current transaction's access mode. A disposable-database probe executed
the same setting and verified that `SHOW transaction_read_only` still returned `off`.

Required action: establish a dedicated read-only transaction before its first query, verify the
actual transaction mode, and use restricted database privileges. Test attempted writes, including
side-effecting functions. No destructive function or production write was attempted in this audit.
See [PostgreSQL transaction defaults](https://www.postgresql.org/docs/current/runtime-config-client.html).

### F3 — High remediation priority: pinned Authlib has six published advisories

Evidence: `requirements.txt:15`; `services/agent_oauth_server.py:6`.

`pip-audit -r requirements.txt` reported six advisories for `Authlib==1.8.0`:

- `GHSA-6v38-4h7w-rj9h`
- `GHSA-fch4-3c6x-j4gc`
- `GHSA-7vr2-2fgp-9w7p`
- `GHSA-c5mf-xmp2-59rc`
- `GHSA-x4rv-c3wx-4cr8`
- `GHSA-8m4g-j4wp-wgcg`

The registry reports fixes in 1.9.0 for the first five and 1.9.1 for the last.
Published issues include [empty JWS signatures](https://github.com/advisories/GHSA-6v38-4h7w-rj9h)
and [empty HMAC keys](https://github.com/advisories/GHSA-8m4g-j4wp-wgcg).
Authlib is used for delegated OAuth; ordinary application sessions use PyJWT. Presence of a
vulnerable package does not establish reachability of every advisory in this application's usage.

Required action: upgrade to a version clearing all current advisories, run delegated OAuth/PKCE,
authorization-code replay and refresh-token-family tests, and retain the dependency audit gate.
The frontend production dependency audit and isolated adapter audit reported no known vulnerabilities.

### F4 — High defense gap: the production SPA CSP does not restrict script execution

Evidence: `client/security-headers.conf:7`, `client/nginx.conf:20`,
`scripts/check_frontend_headers.py:33`, `app.py:109`.

The nginx policy restricts frames, images, and media, but has no `default-src`, `script-src`,
`object-src`, `base-uri`, or `form-action`. Flask has a separate stricter production policy;
it does not protect the app shell served directly by nginx. The container header test checks
that a CSP exists and contains provider frame hosts, so this incomplete policy passes.

Impact: an HTML injection would lack an important script-execution defense. No exploitable XSS
was demonstrated. Markdown rendering and fixed-endpoint provider adapters are positive controls.

Required action: establish a canonical production document policy with restrictive script/default,
object, base, form, frame-ancestor, and connection directives. Exercise it in the actual nginx
container with the app, service worker, monitoring, and cloud pickers. Assert policy semantics,
including a deliberately blocked untrusted script, rather than header presence alone.

### F5 — Medium: production startup accepts a trivially weak JWT signing secret

Evidence: `config.py:226`, `services/auth_service.py:45`.

The startup check rejects only one literal default value. It accepts empty or short values.
A probe confirmed that a one-character JWT secret passes the full production security gate
when the remaining settings are valid. Actual production key strength was not inspected.

Required action: require a high-entropy deployment-generated key, reject empty/short/placeholder
values, document rotation and session invalidation, and test the production configuration matrix.
Length validation is a configuration safeguard, not proof of entropy.

### F6 — Medium: oEmbed HTTP failures can log the provider access token

Evidence: `services/oembed_service.py:105` and `:117`.

The token is sent as an `access_token` query parameter. `raise_for_status()` includes the
prepared URL in `HTTPError`; logging that exception with `exc_info=True` can therefore write the
token to application logs. A mocked provider failure with a synthetic token reproduced this.
The storage telemetry scrubber covers different endpoints and does not sanitize this log path.

Required action: keep provider secrets out of request URLs where supported, and log a sanitized
failure classification/status rather than the raw exception URL. Add log-capture regression tests.
If this integration has been configured and failed in production, inspect restricted logs and rotate
the token if exposure is confirmed. No actual log credentials were inspected in this audit.

### F7 — Medium: single-use password reset is not atomically consumed

Evidence: `services/auth_service.py:248`.

Reset reads a token, checks `used_at`, changes the user, and marks the token used without
locking the token or performing a conditional atomic claim. Two transactions can both observe
an unused token before either commits. This is a code-level concurrency finding; a concurrent
HTTP reproduction was not performed. An attacker would already need the reset token.

Required action: lock and recheck the token in the password-change transaction, or atomically
claim it with an update predicate. Verify with independent connections and assert one success.
Review invitation consumption for the same check-then-write pattern (`admin_service.py:157`),
especially unassigned historical invitations; email uniqueness limits some invitation races.

### F8 — Medium: Cloud Build does not enforce the repository's release gates

Evidence: `cloudbuild.yaml:1`, `:48`, `:112`; `.github/workflows/`.

The checked-in deployment pipeline builds images, runs live migrations, and deploys. It has no
test/audit dependency, pre-migration backup verification, post-deploy authenticated smoke check,
or staged traffic verification. GitHub CI has strong checks, but no checked-in connection proves
that only their passing artifacts can reach this deployment pipeline. External trigger/branch
protections may provide part of this guarantee; they were not accessible in this audit.

Required action: promote immutable tested artifacts, enforce required checks at the deployment
boundary, verify the pre-migration snapshot, and define rollback/forward-recovery behavior.
Schema changes must remain compatible with the revision still serving during migration.

### F9 — Medium reliability gap: rate limits and capacity intentionally use private-beta settings

Evidence: `cloudbuild.yaml:120`, `config.py:244`, `extensions.py:10`.

Deployment explicitly uses in-memory limiting, one worker, and one maximum backend instance.
The guard correctly rejects multiple configured workers with memory storage. Counters still reset
on restart, and separate rollout revisions cannot share counters. This is an explicit beta tradeoff,
not an accidental missing configuration. Four request threads also share capacity with provider
media streams that may run for up to 120 seconds (`services/media_stream.py:71`).

Required action before broader production: shared durable rate-limit storage; documented endpoint
and identity budgets; load tests for normal reads during media streams and expensive analytics;
measured DB-pool/concurrency settings and controlled overload responses. Do not enable scaling
while retaining per-process security counters.

### F10 — Medium operational evidence gap: production recovery is not demonstrated

Evidence: `docs/architecture/BACKUP_RESTORE_RUNBOOK.md:20`, `:107`.

The runbook still has placeholders for actual production backup settings and a pending preflight
row. Its existing recorded drill is local. This audit's disposable logical backup/restore drill
passed, which validates the local tooling but does not prove production retention, PITR, privileges,
provider restore behavior, RPO, or RTO. Pre-migration backup remains a manual step.

Required action: record verified production settings and a controlled production-like recovery
exercise, including required secrets and attachment-reference behavior. Assign owners and evidence
for uptime/error-rate alerts, incident response, retention scheduling, and restoration after key loss.
Absence of repository evidence is not proof those controls are absent in the live account.

### F11 — Medium quality debt: passing type and maintainability gates cover a limited contract

Evidence: `client/tsconfig.typecheck.json`, `.basedpyright/baseline.json`,
`scripts/check_backend_maintainability.py`, `client/scripts/maintainability-audit.mjs`.

Frontend `checkJs` uses `strict: false` and selects API modules and a subset of pure models;
most components, hooks, and offline state machinery are outside its explicit check scope.
Backend static checking passes against 748 baseline diagnostic entries. Backend size exceptions
remain for activities/goals routes and program metrics. The route error-boilerplate cap is 185,
which is containment of debt, not proof that routes are uniformly thin. Frontend exceptions also
retain several large orchestration/render modules.

Fresh all-source frontend coverage is 70.7% statements / 65.6% branches / 67.91% functions /
72.69% lines, while its gates remain 63.5 / 57.8 / 60 / 65.8. That leaves roughly 7–8 percentage
points of regression room despite the documented ratchet intent. Coverage is useful evidence of
reach, not proof of assertions or security completeness; the confirmed analytics exploit passes
the existing functional suite's assumptions.

Required action: ratchet high-risk modules into checking, reduce backend baseline categories,
adopt typed API contracts, and extract stable ownership seams from large orchestrators. Make local
lint reject warnings consistently with CI. Avoid a wholesale rewrite merely to eliminate exceptions.

### F12 — Quality gap: compatibility paths need explicit retirement criteria

Evidence: `services/plan_sections.py:15`, `services/session_analytics_service.py:124`,
`services/_serialize_sessions.py:156`, `client/src/utils/manageActivities.js:50`,
`models/base.py:169`, `client/src/hooks/useFlowTreePreferences.js:43`.

There are still relational-versus-legacy JSON readers, historical session evidence fallbacks,
legacy section normalization, and old preference-key fallbacks. Some preserve real stored data;
their existence is not sufficient evidence that they are dead. The deprecated DB-session helper
is another candidate for a caller inventory. Multiple read representations increase the number
of attribution, deletion, pagination, and client-normalization behaviors that must stay aligned.

Required action: inventory callers and persisted shapes, measure remaining use, migrate where safe,
and delete the losing implementation with regression coverage. Keep historical Alembic behavior
self-contained; do not remove migration-only code merely because runtime callers disappeared.

### F13 — Medium verification gap: the full browser run is red and chart tests share mutable fixtures

Evidence: `client/e2e/goal-charts.spec.js:38`, `:134`, `client/playwright.config.js:5`.

The full desktop/mobile run produced 81 passed, 4 skipped, and 1 failed. The desktop saved-view
workflow failed at line 69 because the expected `1 of 2` chart count did not appear. The same
workflow passed alone against a fresh server in 23.1 seconds (6.9 seconds for the test).

Both chart tests mutate the same per-project `Heatmap Guitar` goal while `fullyParallel: true`
permits them to overlap. One asserts exactly two charts while the other temporarily adds another.
This is a concrete fixture-isolation risk and a plausible explanation for the failure; the precise
timing/root cause was not proven from the trace. A successful isolated retry does not make the
original suite green. Give mutating tests separate entities or explicitly serialize shared fixtures,
then rerun the full suite. Do not hide it with retries or remove the count assertion alone.

The frontend coverage run also exceeded its default 180-second wall limit during concurrent
verification. With a temporary 360-second override it completed in 189.96 seconds and passed.
Reassess measured CI timing/headroom and runner resource contention without weakening checks.

### F14 — Medium release gap: backend contract and migration checks currently fail

Evidence: `tests/integration/test_offline_contract.py:71`,
`tests/integration/test_storage_migration.py:29`, `tests/unit/test_agent_proposal_schemas.py:92`.

The full backend run finished with **1,847 passed and 4 failed**:

1. The serialized note shape disagrees with `client/src/offline/serverContract.json`. The current
   serializer exposes `note_category`, which is absent from the recorded contract. Review the
   complete endpoint shape before regenerating, then align placeholders and persisted-cache
   versioning; merely accepting the fixture diff would bypass the intended compatibility check.
2. The storage migration test directly downgrades the original attachment migration against a
   current schema while `goal_attachments` still references `media_assets`. PostgreSQL refuses
   the table drop. This demonstrates a broken historical-schema test setup, not a proven failure
   of the correctly ordered production migration chain. Recreate its actual predecessor schema
   or unwind dependent revisions in order, preserving the migration policy.
3. A tag-filtered timeline took 975.39 ms against its 900 ms budget during the broad audit.
   The complete 28-test query-budget file subsequently passed without the other workloads
   (13.97 seconds). The initial failure remains recorded; it does not establish a repeatable
   query-count/payload or production latency regression.
4. The adapter proposal-schema artifact disagrees with the canonical schema: the backend's
   `StrictGoalUpdateSchema` includes `attachments`, while the checked-in adapter artifact does
   not. Regenerate/review the artifact and verify both validators accept/reject the same inputs.
   The installed Pydantic version matches the pinned 2.12.5, so this is not explained by a
   different local Pydantic version.

The separate adapter unit suite passed (7 tests), illustrating why isolated unit passes do not
replace cross-implementation contract checks. Fix and rerun the deterministic failures and then
the full supported-runtime CI before treating the working tree as releasable. No application
behavior or generated contract was modified as part of this audit.

## Existing strengths to preserve

- Explicit route → validator → service → serializer ownership and documented invariants.
- Ownership and soft-delete scopes in canonical services; constrained session/group uniqueness
  and relational tag integrity in the database. The analytics escape is a specific exception.
- HttpOnly production auth cookies, constant-time CSRF comparison for cookie-authenticated
  writes, versioned session revocation, an absolute refresh lifetime, password hashing, generic
  forgot-password responses, and password-confirmed exports/account operations.
- Proxy attestation before trusting forwarded client addresses; direct callers cannot simply
  choose a rate-limit identity by setting `X-Forwarded-For`.
- Provider credentials encrypted with rotatable Fernet keys, PKCE/browser-bound OAuth state,
  fixed outbound storage endpoints, redirect refusal, file-type checks, and bounded streaming.
- Per-user offline queues with durable writes, idempotency keys, ordering, retry handling,
  cross-tab coordination, and scoped query persistence; API responses are excluded from SW caches.
- Real PostgreSQL integration/performance tests, disposable databases, schema parity checks,
  populated migration regressions, local restore tooling, browser tests, and bundle budgets.
- Lazy feature loading, bounded history pagination, bulk loaders, responsive contracts, and
  desktop/mobile workflows. The measured authenticated shell is 169.6 KiB gzipped JS plus
  17.7 KiB CSS; Analytics is 324.3 KiB JS plus 34.4 KiB CSS, within checked-in budgets.
- Generic application/database 500 responses and private API cache defaults; monitoring includes
  personal-content masking and storage URL scrubbing, with the oEmbed exception noted above.

## Additional S+ work and unverified surfaces

These are follow-up requirements or risk questions, not additional confirmed exploits:

- Add admin MFA/step-up authentication and audit sensitive support actions; no MFA implementation
  was found. Review login/refresh limits by both account and client, session-key rotation, and
  signed/session-bound CSRF tokens with host-prefixed cookies where deployment permits.
- Define an explicit shared-device policy for readable IndexedDB session/notes data. The query
  cache expires after 48 hours; the offline user snapshot itself has no age check. Retained unsynced
  operations are intentional. Verify logout/expiry/account-switch cleanup while persistence timers,
  in-flight requests, offline startup, and multiple tabs are active. Encryption with a key available
  to the same running JavaScript would not solve XSS.
- Apply query execution budgets to structured analytics as well as SQL mode; its result limit
  bounds rows returned, not aggregation/join cost. Inspect production statement, lock, idle-transaction,
  and connection timeouts and runtime role grants. Existing performance fixtures do not prove
  production concurrency or production query plans.
- Replace automatic catalog inclusion of every model column with explicit exposed-column review
  (`_analytics_catalog.py:_merge_model_columns`). A later schema field should not silently become
  queryable. Require tenant and soft-delete tests for every newly registered dataset.
- Complete dependency locking/hashes for Python transitive dependencies, pin image/action inputs
  where appropriate, and add image vulnerability scanning, SBOM/provenance, and secret scanning.
  Current Python direct pins do not fully lock all cloud/SDK transitives. GitHub actions and base
  images use mutable tags. Audit dev dependencies according to CI/build execution exposure too.
- Expand container checks from pip consistency/header presence to actual production boot and
  configuration, non-root behavior, CSP enforcement, caching, proxy identity, graceful termination,
  and bounded overload. Frontend container root/master behavior was not executed in this audit.
- Run automated accessibility checks plus keyboard/screen-reader QA for dense goal/session/chart
  flows. Mobile tests use Chromium with iPhone viewport emulation, not actual Safari/WebKit;
  add that engine for offline storage/media and touch interactions.
- Complete real-provider OAuth/media and gated AI worker release evidence. Mocked adapters and
  local browser workflows cannot establish provider console permissions, production secrets,
  refresh/revocation behavior, or live callback correctness.
- Verify actual cloud IAM, network exposure, database grants/RLS, backup encryption/retention,
  scheduled erasure execution, monitoring/alert routing, and branch/deployment protection. No
  live infrastructure assessment, penetration test, or full Git-history secret scan was performed.

## Validation evidence

Audit runs and final counts are recorded below after completion. The initial sandboxed `all` run
could not connect to localhost PostgreSQL; its frontend suite succeeded, and the backend was rerun
with local database access. No sandbox failure is counted as an application defect.

| Check | Result |
| --- | --- |
| `./run-tests.sh lint` | Passed: ESLint, responsive/maintainability gates, basedpyright ratchet, frontend checkJs |
| Frontend unit/component suite | 414 files / 2,204 tests passed |
| `npm run build` | Passed, including route bundle budgets and service-worker generation |
| `./run-tests.sh audit` | Failed: six Authlib advisories; command stops at backend audit failure |
| Independent `npm audit --omit=dev` | Passed: zero reported vulnerabilities |
| Independent adapter `pip-audit` | Passed: no known vulnerabilities |
| Disposable security probes | Four passed: cross-account disclosure, ineffective transaction mode, weak-key acceptance, and synthetic token logging reproduced |
| `./run-tests.sh restore-drill` | Passed: disposable logical backup/restore, 18.41 seconds |
| Backend unit/integration/performance/e2e suite | 1,847 passed / 4 failed; three contract/migration-check failures plus one marginal latency failure; no fresh backend coverage measurement in this no-coverage run |
| Query-budget file rerun | All 28 passed without concurrent frontend/browser workloads; initial 975.39 ms vs 900 ms failure remains recorded |
| Isolated MCP adapter unit suite | All 7 passed; run separately because the failed backend suite stopped the combined runner |
| Frontend coverage | Passed: 414 files / 2,204 tests; statements 70.7%, branches 65.6%, functions 67.91%, lines 72.69%; rerun with `VITEST_WALL_TIMEOUT_MS=360000` after initial 180-second timeout |
| Desktop/mobile browser suite | 81 passed, 4 skipped, 1 failed in 6.2 minutes; failed desktop goal-chart test passed alone on a fresh server (23.1 seconds); full suite remains red |

Local Python is 3.13; CI and the production container target 3.12. Repository CI remains the
authoritative supported-runtime check. Docker image build/runtime and live nginx header checks
were inspected in CI definitions but not executed locally in this audit.

### Requested retry — October 28, 2026

Retried the four failed backend tests in a fresh disposable database, both desktop chart
workflows together on a fresh server, and the production dependency audit. No application,
test, migration, or generated-contract changes were made before the retry.

| Retried check | Result |
| --- | --- |
| Offline serializer contract | Failed again: recorded note shape differs from the endpoint |
| Storage migration preservation test | Failed again: `goal_attachments` still depends on `media_assets` during the direct downgrade |
| Tag-filtered progress timeline budget | Passed |
| Canonical/adapter proposal schema parity | Failed again: adapter artifact differs from canonical schema |
| Desktop goal-chart file, both tests with two workers | Both passed in 16.4 seconds |
| Production dependency audit | Failed again: the same six Authlib 1.8.0 advisories |

The targeted backend retry finished with 3 failed and 1 passed in 4.01 seconds. These repeat
failures strengthen the contract/migration findings. The timing and chart checks now pass on
targeted retries; that does not replace a clean full-suite run or resolve the shared browser
fixture risk. The security findings were not remediated, and production/S+ sign-off remains
blocked. `index.md` already links this report and flags the analytics isolation defect; the
retry introduces no architectural change requiring another index update.

## Remediation — October 28, 2026

All findings except the deliberate private-beta capacity settings (F9) and the items that
need live infrastructure (F8, F10) were remediated the same day. Each confirmed reproduction
became a regression test that fails on the pre-fix code.

| Finding | Remediation | Evidence |
| --- | --- | --- |
| F1 raw SQL escape | `services/_analytics_sql_guard.py` parses the query with sqlglot and accepts it only when every relation resolves, under PostgreSQL CTE scoping, to a catalog dataset or an earlier CTE. Functions and cast types are allowlisted. DML, DDL, `INTO`, locking, recursive CTEs and parameters are refused. The SQL that runs is regenerated from the validated tree, so sqlglot and PostgreSQL cannot read the query differently. The `analytics_sql_explorer` flag now gates the API, not only the UI. An optional `ANALYTICS_SQL_ROLE` adds a least-privilege role whose grants are generated from the tables the catalog reads (`scripts/analytics_sql_role_grants.py`). See [Analytics SQL boundary](../docs/architecture/ANALYTICS_SQL_BOUNDARY.md). | `tests/integration/test_analytics_sql_guard.py`: 25 escape probes (quoted schemas, CTE shadowing including forward references, nested and lateral subqueries, `query_to_xml`, `pg_read_file`, `set_config`, `reg*` casts, data-modifying CTEs, backslash-literal differentials). It also covers the HTTP password-hash probe for a caller with no fractals, flag enforcement, saved-profile rejection, and a role granted only the allowlist that runs catalog SQL while being denied `users`. |
| F1 (found during fix) | Six visualization explanation queries read `metric_definitions`, which was not a catalog dataset, so the old path returned every tenant's rows. It is now a root-scoped dataset. | `test_raw_sql_scopes_metric_definitions_to_the_caller`. A shared corpus (`tests/fixtures/analytics_sql_corpus.json`) is generated from the real visualization builders by a client test, and every entry runs through the guard against PostgreSQL. |
| F1 S+ item | Exposing a newly added catalog column now needs a reviewed snapshot change. | `tests/unit/services/test_analytics_catalog_exposure.py` with `tests/fixtures/analytics_catalog_fields.json` (no credential or token columns are exposed today). |
| F2 read-only mode | Raw and structured analytics now run in a savepoint with `SET TRANSACTION READ ONLY` and a statement timeout. The mode is read back before the query runs, and the savepoint is rolled back so the request's transaction mode is restored. Driver errors become 400s, and timeouts return a named message. | `test_read_only_scope_blocks_writes_and_restores_the_request_transaction`, `test_raw_sql_statement_timeout_applies` |
| F3 Authlib | Upgraded to 1.9.1 and pinned sqlglot 30.25.0 (no dependencies). | `./run-tests.sh audit` is clean. The OAuth flow test still covers PKCE, code replay, refresh rotation and family revocation, plus new tests for a wrong or missing PKCE verifier and for refusing `plain` PKCE. |
| F4 CSP | The inline boot scripts and `onload` handler moved to `client/public/boot/shell.js` (revalidated, precached). The nginx document policy now sets `default-src 'self'`, `script-src 'self' https://apis.google.com`, `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors 'none'`, `connect-src` and `worker-src`. Proxied `/api/` responses carry only the shared headers, so the backend's own documents keep Talisman's nonce CSP. Flask's policy adds `object-src 'none'`. | `scripts/check_frontend_headers.py` now checks directive meaning, the absence of inline script in the shell, and the boot-script caching. `client/scripts/check-csp-enforcement.mjs` (added to frontend CI) loads the built container in Chromium: the shell boots without violations, and injected inline and foreign-origin scripts are blocked. |
| F5 JWT secret | Production rejects known placeholders and secrets shorter than 32 characters or with fewer than 8 distinct characters. | `test_production_security_rejects_weak_jwt_secret` (parametrized), `..._accepts_minimum_length_generated_jwt_secret` |
| F6 token logging | oEmbed failures log only the exception class and HTTP status. The Sentry scrubber also drops Graph API breadcrumbs and spans, which carry the token in `http.query`. | `test_upstream_http_failure_never_logs_the_access_token` fails on the old code. `test_telemetry_drops_token_bearing_instagram_oembed_breadcrumbs` |
| F7 single-use races | Password reset claims its token with one conditional `UPDATE … WHERE used_at IS NULL` before any change. Invite consumption is a conditional claim that the signup path checks. | `tests/integration/test_single_use_token_races.py`: with 4 independent connections, the old code allowed 4 resets from one token and created **4 accounts from one invite**. The new code allows exactly one. |
| F11 debt | Lint has zero warnings locally, matching CI. Frontend coverage gates are raised to 70 / 65 / 67 / 72. 15 offline and queue modules (plus `noteTypes.js`) moved into `checkJs`. The basedpyright baseline went from 748 to 735 entries. Typing the outbox found a real bug: a manual retry kept its old failure budget and could be rejected again after one more failure. That is fixed and tested. The pinned SDKs' argument types are now satisfied. | `npm run typecheck` reports 0 errors. `gives a manually retried change a fresh failure budget` fails on the old code. |
| F12 compatibility | A caller inventory showed the "deprecated" `get_session` is the intended independent-session primitive (idempotency claims, the event-log executor, completion handlers), so its contract is now documented rather than deleted. A read-only `scripts/compat_inventory.py` counts the rows each legacy reader still serves. It prints counts only and is safe for production. | `tests/integration/test_compat_inventory.py`. The local development data still has 19 legacy templates and 421 unwrapped session attribute payloads, so those readers stay until a backed-up data migration is approved. |
| F13 shared browser fixture | The add-chart workflow mutates its own seeded `Chart Sandbox` goal. | Both chart workflows and the analytics and heatmap specs that share the root pass together. |
| F14 contract and migration gates | The note serializer contract was regenerated with only the reviewed `note_category` addition. Offline placeholders now derive it through a fixture-checked `deriveNoteCategory` and reuse the canonical note-type labels (the local copy lacked `goal_review_note`). The cache version follows the contract hash. The storage migration test unwinds dependent revisions in order. The adapter schema used to advertise three fields the validator always refused (`attachments`, `completed`, `review_deferred_until`); both now come from one `SUPPORTED_AGENT_GOAL_UPDATE_FIELDS` set. | New tests check that the backend and adapter accept and reject the same goal-update inputs. |
| Environment finding | Installing the pinned requirements, as CI does, exposed tests that only passed without `google-cloud-bigquery`: the BigQuery fake lacked the retention and prune calls. | The fake now implements them. |

Not remediated, by decision or because they need access this audit does not have:

- **F8**: binding Cloud Build to passing CI artifacts, verifying backups before migrations,
  and smoke checks after deploys all depend on trigger and branch-protection settings and
  deployment credentials outside the repository.
- **F9**: the private-beta in-memory rate limiting with a single instance is deliberate.
- **F10**: production backup and PITR settings and a production-like restore drill need the
  live account.
- **Deployment follow-ups for these fixes**: confirm the production `JWT_SECRET_KEY` meets
  the new minimum before deploying (startup now fails closed otherwise). If
  `analytics_sql_explorer` was ever enabled in production, review
  `/api/analytics/query/run` access logs. Optionally create `ANALYTICS_SQL_ROLE` from the
  generated grants. Verify the Google Picker flow against the new `script-src`, which only
  a real provider session can exercise.

## Rerun after remediation — October 28–29, 2026

| Check | Result |
| --- | --- |
| `./run-tests.sh lint` | Passed. ESLint now runs with zero warnings allowed locally as well as in CI. Maintainability and responsive gates pass. basedpyright reports 0 new errors (baseline down from 748 to 735). Frontend `checkJs` reports 0 errors across the expanded scope. |
| `./run-tests.sh audit` | Passed. pip-audit finds no known vulnerabilities (Authlib 1.9.1). `npm audit --omit=dev` finds 0. |
| Frontend unit, component and coverage | 416 files / 2,217 tests passed. Statements 70.72%, branches 65.7%, functions 67.9%, lines 72.71%, against the new 70 / 65 / 67 / 72 gates. |
| `npm run build` | Passed, within bundle budgets. The authenticated shell is unchanged at 169.6 KiB gzip JS. |
| nginx container, header semantics | `scripts/check_frontend_headers.py` passed on the app, deep link, boot script, worker, manifest, error and API responses. |
| nginx container, browser CSP enforcement | `client/scripts/check-csp-enforcement.mjs` passed. The shell boots without violations, and injected inline and foreign scripts are blocked. |
| Analytics boundary suite | 38 passed: escape probes, HTTP probe, flag, profiles, scoping, timeout, read-only scope, least-privilege role, and the 40-query explanation corpus. |
| Single-use race suite | 3 passed. On the pre-fix code it fails with `[200, 200, 200, 200]` resets and `[201, 201, 201, 201]` signups. |
| `./run-tests.sh restore-drill` | Passed in 2.76 s, now including `ANALYZE` on the restored database. |
| Full backend suite | **1,912 passed, 0 failed** (8 min 05 s, uncontended), plus the isolated MCP adapter suite: 7 passed. Before the history-fixture fix, two full runs had one failure: `test_analytics_aggregates_instances_without_hydration[10000]` (about 6 s against a 5 s budget; see N1). For comparison, an untouched `HEAD` full run had 4 failures. |
| Desktop/mobile browser suite | 81 passed, 4 skipped, 3 failed. The failures are program-calendar specs (`program-day-adjustments`, `program-goal-due-dates`, `program-day-status`). An untouched `HEAD` checkout fails the same specs (4 failures) at the same time of day, about 23:30 EDT, when the local date (Oct 28) differs from the UTC date (Oct 29). This is pre-existing and not caused by this remediation; see N2. Both goal-chart workflows (F13) passed. |

### New findings from the rerun

**N1 — Performance, fixed operationally: goal analytics is quadratic under stale planner
statistics.** The intermittent history-scaling failure was reproduced deterministically by
analyzing empty tables and then bulk-loading history. Goal analytics took 12.5 s for 5,000
sessions and 53 s for 10,000. With near-empty statistics, PostgreSQL nests
unparameterized index scans, for example on `ix_activity_instances_session_id` with only a
filter. Normal growth keeps statistics current through autoanalyze, but a logical restore
carries no statistics. So right after disaster recovery, a long-history account's analytics
could take about a minute. The runbook (4a, 4b) and the restore drill now run `ANALYZE`. The
history fixture analyzes after its bulk import, so the budget guards query structure rather
than racing autoanalyze. A planner-independent rewrite of `analytics_evidence` (for example,
pre-aggregating per session before the goal joins) remains an S+ follow-up.

**N2 — Verification gap, open: program-calendar browser workflows fail when local and UTC
dates differ.** Three or four program specs fail on both this branch and `HEAD` late in the
evening (Eastern time). The cause, a test-clock assumption or a product off-by-one in
day bucketing, has not been determined. Next step: run those specs with a fixed
`timezoneId` and a mocked clock at both sides of UTC midnight. A product bug would mean
calendar actions land on the wrong day for users west of UTC each evening.

## Ordered plan to reach S+

1. **Contain the confirmed security defects.** Remove/disable public raw SQL execution, patch
   Authlib, fix current-transaction read-only behavior if SQL remains, remove token-bearing logs,
   validate signing secrets, and enforce CSP on the delivered SPA. Exit: all confirmed defect
   reproductions become denial/sanitization tests and pass; dependency audits clear; actual
   delivered documents block untrusted script execution. If deployed SQL was exposed, perform
   an access-log/incident review and assess affected credentials/data without assuming a breach.
2. **Prove security invariants under adversarial inputs and concurrency.** Clear the failing
   offline/adapter contract and migration verification gates. Cover catalog escapes,
   tenant isolation on every dataset/relationship, reset-token atomicity, support-access boundaries,
   offline account transitions, and provider failure/redaction. Exit: independent-connection
   and real HTTP regressions prove isolation, single-use behavior, and durable/idempotent writes.
3. **Make release safety executable.** Connect passing CI to immutable artifact promotion; verify
   backups before migrations; test populated upgrades and compatibility with the serving revision;
   exercise production container boot, headers, smoke checks, and recovery. Exit: a deliberately
   failed gate cannot deploy; a failed rollout has demonstrated recovery with recorded timing.
4. **Close operational evidence.** Move rate limits to shared storage, define and measure capacity,
   record production backup/PITR settings and restoration, exercise alerts/erasure scheduling and
   real-provider integrations. Exit: named owners, measured RPO/RTO and latency/error objectives,
   load/overload results, and dated release evidence rather than unchecked runbook fields.
5. **Reduce complexity while preserving behavior.** Expand types around offline/auth/domain
   mutation boundaries; retire compatibility readers after data/caller inventory; shrink major
   orchestrators and route boilerplate; strengthen critical branch and browser-engine coverage.
   Exit: one canonical implementation per behavior, shrinking debt baselines, and critical
   workflows demonstrated through keyboard, mobile, offline, and failure scenarios.

S+ completion requires both corrected implementation and repeatable production evidence. Passing
lint/build or raising a coverage percentage alone is insufficient. This audit completed the
assessment and recorded a remediation plan; it did not implement that plan.

Suggested audit commit: `docs: audit code quality, production readiness, and security`
