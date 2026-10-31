# Independent remediation review — October 29, 2026

## Decision and current grades

The remediation is a substantial improvement over the
[October 28 audit](code-quality-security-audit-2026-10-28.md). The original direct password-hash
query is refused, transaction read-only enforcement works, dependency audits clear, and the
credential race/contract fixes pass independent checks. **The report's blanket security-closure
and code-ready claims are premature:** the new SQL boundary has untested namespace/type gaps,
and three additional implementation/verification issues remain below.

These grades assess the inspected working tree, not a deployed environment or a certification.
They separate build-artifact quality from the safety of the release process; they are not averaged.
The remediation is now committed as `f80ba845`; the reviewed application changes are in that revision.

| Area | Current grade | What prevents S+ |
| --- | --- | --- |
| Code quality and architecture | A− | Remaining compatibility and orchestration debt; incorrect inventory; limited strict typing |
| Automated verification | A− | New boundary cases absent from the regression suite; known full-browser failures and timezone uncertainty |
| Production build artifacts | A− | Build and actual nginx CSP/header checks pass; monitored/provider-enabled scenarios and image/supply-chain evidence remain |
| Application security | B+ | SQL namespace/type validation and result-byte bounds; live deployment and key verification; admin MFA remains a follow-up |
| Performance | B+ | Statistics-dependent analytics plan remains; production concurrency and result-size bounds unproven |
| Operational and release readiness | C+ | F8–F10 remain open or deliberately limited to beta; production recovery and enforced promotion need evidence |
| Overall production readiness | B | Substantial code improvement, with implementation and operational work still needed for sign-off |

## Findings from reviewing the remediation

### R1 — P2: SQL function namespaces and nested cast types escape the intended allowlist

Source: `services/_analytics_sql_guard.py:109–112`, `:118–134`, `:174–179`.

The guard checks a function's sqlglot class/name, but not every function's schema qualifier.
For table functions `_check_table` returns before checking `db`/`catalog` when `node.this`
is not an identifier. A qualified `review_schema.generate_series(1, 1)` is accepted as
the allowlisted generate-series AST node, even though PostgreSQL resolves a different routine.

**Confirmed in a disposable database:** a synthetic schema contained a SQL `SECURITY DEFINER`
routine named `generate_series(integer, integer)` that selected a synthetic user's password hash.
The production analytics service accepted the qualified function and returned that hash to a
different caller scope with no owned roots. Read-only mode permits that function's SELECT.

**Precondition matters:** such a callable routine must already exist. The probe created it through
the privileged test setup, not through an analytics request. This does not show that a normal
application user can create routines or that an exploitable routine exists in production. The
original direct `FROM users` exploit remains blocked. It does show that the claimed built-in,
pure-function boundary is incomplete; a table-only grant role is not a substitute for validating
call targets, particularly for definer functions.

Cast validation has a related structural gap. Only a `DataType` immediately under a Cast/TryCast
is checked. For an array, that outer type is `ARRAY`; its element type is not checked. This
accepted query executed successfully:

```sql
SELECT CAST(CAST('{users}' AS pg_catalog.regclass[]) AS text) AS metadata
```

It returned `{users}`, despite the documented refusal of `reg*` types. Arbitrary schema-qualified
array element types also pass the parser guard. The regclass example demonstrates type-policy
bypass and relation-name resolution, not disclosure of account rows by itself.

Required correction: validate complete function identity/qualification, recursively validate all
cast element types, and review qualified operator/type constructs under the same default-deny
policy. Add safe-schema qualification controls and nested-array/definer-function regressions.
Do not treat this review as proof that every remaining PostgreSQL grammar construct is safe.

### R2 — P2: SQL result memory and response bytes remain unbounded

Source: `services/_analytics_execution.py:119–131`.

The outer LIMIT bounds rows, and the statement timeout bounds query execution time. Neither
bounds an individual value's size. `result.mappings().all()` materializes it before the application
has any response-byte policy.

**Confirmed with a deliberately small probe:** the following allowlisted query returned one
2,097,152-character string through `AnalyticsEngineService.run_query` with status 200:

```sql
SELECT string_agg('x', '') AS oversized
FROM generate_series(1, 2097152)
```

The 2 MiB value is evidence that there is no application byte cap; it is not itself an OOM test.
The same query shape permits larger generated/aggregated values within available execution
resources. On a small, single-instance beta deployment this creates avoidable memory, latency,
and bandwidth exposure. This is a remaining production-hardening gap, not a newly introduced
cross-tenant disclosure.

Required correction: establish a documented byte/value budget and enforce it before unbounded
result materialization/serialization, with exact-limit and over-limit tests. Streaming alone is
insufficient if a single driver value can already exceed the budget.

### R3 — P2: compatibility inventory can incorrectly report zero live fallback users

Source: `scripts/compat_inventory.py:53–61`, contrasted with
`services/session_analytics_service.py:190–192`.

The inventory excludes a session from legacy evidence counting if **any** activity-instance row
exists, including a soft-deleted row. The runtime excludes only sessions with a **live** instance.

**Confirmed:** a completed session containing legacy exercise evidence and only one soft-deleted
relational instance was counted as zero by the inventory, while the authenticated analytics-summary
endpoint returned its legacy evidence. This is a false negative in the proposed evidence for deleting
compatibility code. The runtime reader currently still works; no data was removed.

Required correction: mirror the runtime live-instance predicate and add zero/one/mixed/deleted-only
instance cases. Prefer a SQL EXISTS/subquery or bounded lookups over the current all-session-ID
set, which grows with the full activity-instance population. Re-run the inventory before using its
counts to retire readers or justify a migration.

### R4 — P2: the tightened CSP blocks Sentry replay compression when monitoring is enabled

Source: `client/security-headers.conf:6`, `client/src/utils/monitoring.js:43–47`,
`client/scripts/check-csp-enforcement.mjs:46–52`.

The new `worker-src 'self'` refuses Blob workers. The installed `@sentry-internal/replay` 10.38.0
creates its default compression worker from a Blob URL (`build/npm/esm/index.js`, `_getWorkerUrl`
and `_loadWorker`). The application supplies no alternative worker URL or compression setting.

**Confirmed against a container built from the current code:** a Blob worker that posted a harmless
`ready` message failed with a worker error and a `worker-src` policy violation. Its constructor
returning successfully was not enough; the execution probe awaited its message/error. No Sentry
account or real telemetry was used.

The SDK catches worker initialization failure and falls back to its simple uncompressed event
buffer. **This is not proof that replay or error monitoring stops altogether.** It is an unintended
compression/observability regression whenever `VITE_SENTRY_DSN` enables the existing integration.

The new CSP checker loads a build without a monitoring DSN and checks only initial `script-src`
violations, so it does not establish that enabled monitoring/provider workflows are CSP-clean.
Its inline/foreign-script enforcement assertions are useful and passed independently.

Required correction: preferably host the SDK worker as a versioned same-origin asset and configure
its URL; alternatively make an explicit, reviewed compression/CSP choice. Exercise a monitored
build with local stubs and check worker and connection directives as well as script directives.
Retain the script protections rather than weakening them indiscriminately.

## Disposition against every original finding

| Finding | Independent disposition |
| --- | --- |
| F1 SQL isolation | **Partially closed.** Original table/CTE escapes and the HTTP hash probe are refused; namespace/type validation remains incomplete (R1). Result budgeting also needs R2. |
| F2 read-only transaction | **Closed for the tested paths.** Actual current-transaction mode, refused writes, restoration and timeout tests pass. |
| F3 Authlib advisories | **Closed at the audit date.** Pinned 1.9.1; production Python, adapter and npm audits all pass. |
| F4 delivered CSP | **Core fix verified; integration gap remains.** The built nginx container has the required directives and blocks inline/foreign scripts. R4 affects monitored builds; real Google Picker validation remains pending. |
| F5 weak signing-secret gate | **Code fix verified.** Weak/placeholder-key regression cases pass. The live production key was not inspected. |
| F6 token logging | **Code fix verified.** Sanitized oEmbed logging and redaction regressions pass; production exposure review remains separate. |
| F7 single-use races | **Code fix verified.** Atomic token/invite claims and independent-connection race tests pass. |
| F8 deployment gates | **Open.** Cloud Build still lacks enforced tested-artifact promotion, pre-migration backup verification and post-deploy smoke checks. Some implementation can be prepared in-repo; validating live enforcement needs infrastructure access. |
| F9 rate-limit/capacity | **Accepted beta limitation, not broader production closure.** Memory counters and a single instance remain configured. |
| F10 production recovery | **Open.** ANALYZE in the local drill/runbook is useful; production backup/PITR verification and a production-like restore remain unproven. |
| F11 typing/maintainability/coverage | **Improved, partially closed.** Expanded checkJs and 735-entry backend baseline pass; coverage ratchets were raised. Baseline exceptions, non-strict scope and broader orchestration debt remain. |
| F12 compatibility/dead code | **Partial.** Retaining the independently scoped DB-session primitive is correct; inventory is useful but incorrect for deleted-only instances (R3). No blanket deletion of legacy readers is justified. |
| F13 browser fixture sharing | **Implementation corrected.** Chart tests now mutate separate seeded goals. Independent desktop/mobile rerun recorded below. Broader browser/calendar issues remain separate. |
| F14 contract/migration failures | **Focused regressions pass.** Offline contract, adapter parity and correctly ordered migration reversal checks pass. |

N1 and N2 in the remediation report also remain relevant. Running ANALYZE after a logical restore
is a valid operational mitigation; it does not make the statistics-sensitive analytics query
planner-independent. Analyzing the performance fixture no longer exercises the stale-statistics
case that exposed it. Preserve that case as a separate recovery/scaling guard if it remains an
accepted operational dependency. The acknowledged evening timezone/calendar failures remain
unresolved; observing them on HEAD establishes provenance, not production acceptability.

## Independent verification

| Check performed for this review | Result |
| --- | --- |
| Focused backend security/race/contract/migration/inventory/catalog/delivery suite | **95 passed**, 19.95 seconds, disposable PostgreSQL database |
| Independent boundary/inventory probes | **5 behavior probes passed**, 3.60 seconds: qualified function execution, nested regclass array, 2 MiB single-row output, deleted-only inventory false negative, and an ONLY-relation control; these reproduce current behaviors, not five additional security fixes |
| Focused frontend outbox/contract/preload/SQL-corpus/note-control suite | **41 passed** across 5 files |
| `./run-tests.sh lint` | Passed: zero-warning lint, type ratchets, maintainability and responsive checks |
| `./run-tests.sh audit` | Passed: no known production Python/adapter/npm vulnerabilities |
| `npm run build` | Passed, including existing bundle budgets and service-worker generation |
| Fresh frontend image build | Passed: `fractal-client:review-20261029` |
| Actual nginx header semantics | Passed using `scripts/check_frontend_headers.py` on that image |
| Actual browser inline/foreign-script enforcement | Passed using `client/scripts/check-csp-enforcement.mjs` on that image |
| Independent Blob-worker execution probe | Blocked: worker error and `worker-src` violation, confirming R4 |
| Desktop/mobile goal-chart workflows | **4 passed**, 26.7 seconds, fresh disposable server; repaired fixture isolation verified |

The historical full-suite counts in the remediation report were not reclassified as independently
rerun here. This review used focused checks appropriate to the changed boundaries. No production
data, routine, account or deployment was accessed. Synthetic SQL routines and records lived only
in disposable databases. Temporary audit probe files were removed after recording results.
The remediation commit captured `test_remediation_review_temporary.py` while this review was in
progress; its deletion in this review cleans up that temporary file. Its assertions intentionally
confirmed existing unsafe behavior, so it must not be mistaken for a corrected-behavior regression
suite. The permanent corrective regressions described above still need to be written with the fixes.

## Distance to S+ and recommended order

1. Close R1 with complete namespace/type validation and regression cases. Confirm the original
   refusal tests and real visualization query corpus still pass.
2. Bound SQL values/results (R2), correct the inventory (R3), and make the monitored build's CSP
   behavior explicit (R4). Avoid retiring readers from an undercounted inventory.
3. Resolve the fixed-clock/local-versus-UTC calendar cases, retain a stale-statistics recovery
   guard, and rerun the complete supported-runtime gates after corrections.
4. Complete F8–F10 with enforced artifact promotion, migration backup checks, deployment smoke
   checks, production recovery evidence, and a rate-limit/capacity decision appropriate to launch.
5. Continue shrinking compatibility, typing and orchestration debt without a wholesale rewrite.

The work is close to an A-level codebase, but S+ production readiness requires these explicit
behavioral and operational proofs. This task reviewed and documented the changes; it did not
implement the next remediation round.

Suggested review commit: `docs: independently review audit remediation and update production grades`


## Round 2 remediation — October 29, 2026

Implemented from [the round 2 plan](remediation-round-2-plan-2026-10-29.md). Each review
reproduction is now a regression that passes on the fixed code. Where a test was checked
against the previous code, it failed there.

| Item | Change | Evidence |
| --- | --- | --- |
| R1 namespaces and types | The guard refuses schema-qualified function calls (`Dot` over a function, and qualified table functions, whose qualifier is now checked before the table-function early return), qualified columns, `OPERATOR(schema.op)`, and any non-allowlisted type anywhere in the tree, including array elements and user-defined or qualified types. Raw SQL runs with `search_path = pg_catalog, pg_temp`, and the catalog CTEs are compiled with the live schema qualified. | `test_analytics_sql_guard.py`: 8 new probes; `test_qualified_security_definer_function_cannot_read_outside_the_catalog` (the review's definer routine is now refused); `test_unqualified_calls_resolve_to_built_ins_not_application_schema_overloads`, which returns `hijacked` without the pin and `mixed` with it. The 40-query explanation corpus and the original probes still pass. |
| R2 output bytes | Raw SQL is size-checked inside PostgreSQL before any row is fetched: 64 KiB per row, 4 MiB total. Structured results are checked against the same total. | Tests at the exact limit, one byte over, the review's 2 MiB `string_agg` probe (now 400), many-small-rows over the total, and a structured over-budget case. |
| R3 inventory | The legacy-evidence count uses a SQL `EXISTS` on *live* instances, mirroring `SessionAnalyticsService`, so memory no longer grows with the instance table. | Zero, live, mixed, and deleted-only cases, plus an HTTP parity test against `/sessions/analytics-summary`. The local rerun gives 19 legacy templates, 0 legacy-evidence sessions, and 422 unwrapped sessions. |
| R4 replay worker | `replayIntegration({ workerUrl })` uses the SDK's worker, emitted by Vite as a hashed same-origin asset; `worker-src 'self'` is unchanged. | A unit test checks the same-origin `workerUrl`. `check-csp-enforcement.mjs` runs the image's actual worker asset (it posts `init`), confirms a Blob worker stays blocked, and confirms intercepted Sentry ingest is allowed with no other violations. |
| N1 stale statistics | `analytics_evidence` drives every join through fenced `LATERAL` lookups keyed by the outer row, with tenant and deletion checks outside the fence, so only key indexes are usable. | `test_goal_analytics_stays_linear_with_stale_planner_statistics` (10,000 sessions, statistics analyzed while empty, autovacuum off): **179 ms**, previously 22–53 s. Analyzed-statistics budgets are unchanged. 47 goal-analytics correctness tests pass. `ANALYZE` after restores stays in the runbook. |
| N2 calendar dates | Root causes: (1) **Product:** FullCalendar took "today" from the device clock rather than the timezone preference, so it now receives `now` in the preference zone. (2) **Product (mobile):** the fixed bulk status bar covered the calendar's last week and could not be scrolled clear, so clearance is now added while the bar shows. (3) **Tests:** specs dragged to cells below the scroll fold (a shared `dragBetween` helper now scrolls and verifies hits), and one assumed today+2 is never a Saturday. These failed whenever targets fell in the grid's last row or on a Saturday, as at month end, not only in the evening. | Unit tests for `now` across month boundaries and for the clearance. A new `desktop-late` Playwright project runs every program spec at 22:00 New York time (UTC date ahead). All program specs pass on desktop, mobile, and desktop-late. |
| F8 release gates (in repository) | `cloudbuild.yaml` runs, in order: a fail-closed CI gate (the commit's five required checks must have passed), a verified pre-migration `pg_dump` stored to GCS before `migrate-db`, `--no-traffic` candidate deploys with smoke checks, then promotion. Jobs update only after the backend is promoted. | `scripts/deploy_gates.py` with `tests/integration/test_deploy_gates.py` (CI verdicts, fail-closed token handling, backend smoke against the real app, frontend CSP smoke, tag URL parsing, step order and `$$` escaping). Live proof needs the one-time setup and staging procedure in `BACKUP_RESTORE_RUNBOOK.md` §5. |

### Found during round 2 verification

| Item | Change | Evidence |
| --- | --- | --- |
| N3 progress comparisons under churned statistics | The uncontended full suite showed `/sessions/analytics-summary` taking 5.16 s, against 0.24 s alone. The per-candidate session lookup kept `deleted_at IS NULL` inside its fence, so the planner picked that index and filtered by key, rescanning every session per candidate. The batch targets joined sessions by filter as well. Both are now fenced primary-key probes with deletion checks outside. | Under the reproducing sequence: 5,752 ms became 233 ms. A new stale-statistics guard covers every power-account root read. 74 progress and session-analytics correctness tests pass. No fixture reproduced the churned state deterministically, so the uncontended full suite remains its guard. |
| Programs header layout | Once block data loads, the title reads "program • block • date", and at 1280 px the view tabs and Options wrapped onto separate rows. A test passed only when it measured before the block arrived. `PageHeader` gained `singleRowActions` (desktop only); the title wraps instead. | The spec now waits for the settled title and fonts: 3 of 3 runs pass on desktop, mobile and desktop-late. A `PageHeader` unit test covers the option. |
| Stale browser specs | `00e40d76` (made in parallel) moved "Add note" before the paperclip without updating `note-media.spec.js`. The new `desktop-late` seed made a substring match in `agent-connections.spec.js` ambiguous. | Both specs updated: the note-media spec to the new order, the agent spec to an exact name match. |

### Final verification (October 29, uncontended)

| Check | Result |
| --- | --- |
| `./run-tests.sh lint` | Passed: zero warnings, 0 new basedpyright errors, frontend typecheck clean, maintainability and responsive gates |
| `./run-tests.sh audit` | Passed: no known vulnerabilities (Python, adapter, npm) |
| Backend full suite | **1,951 passed, 0 failed**; adapter suite 7 passed |
| Frontend unit and coverage | 416 files / 2,223 tests passed; 70.74 / 65.72 / 67.92 / 72.73 against the 70 / 65 / 67 / 72 gates (one `PageHeader` test added afterwards also passes) |
| Browser suite (desktop, mobile, desktop-late) | **92 passed, 4 skipped, 0 failed** |
| nginx container | Header and CSP semantics passed. Browser enforcement passed: inline and foreign script blocked, same-origin replay worker runs, Blob worker blocked, Sentry ingest allowed |
| Restore drill | Passed, including `ANALYZE` |

Still open by design or access: F9 (beta rate limiting), F10 (production backup/PITR
settings and a production-like restore), live verification of the F8 gates in your GCP
project, admin MFA, and WebKit coverage.
