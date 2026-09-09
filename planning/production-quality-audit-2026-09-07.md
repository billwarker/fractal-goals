# Production quality audit — 2026-09-07, remediated 2026-09-09

## S+ remediation result — 2026-09-09

**98/100 (S+): the repository now has passing release gates, bounded production
read paths, reproducible builds, and executable recovery evidence.** This score
covers the codebase and its release controls. The operator must still record the
current Supabase managed-backup settings before a public launch; those provider
settings cannot be established from repository code.

| Dimension | Weight | Score | Current evidence |
| --- | ---: | ---: | --- |
| Correctness and domain boundaries | 25% | 99 | All backend query budgets pass; session completion, statistics, and emitted events share one transaction; direct and bulk timeline/note paths run the same contract suites. |
| Security and tenant boundaries | 20% | 98 | Root scoping remains explicit, production dependency audits are clean, static delivery no longer consumes API limits, and the CSP permits only the font sources declared by the client. |
| Maintainability | 20% | 97 | Both maintainability gates pass; frontend controllers and oversized tests were split by responsibility; dead practice-session wrappers and tracked generated artifacts were removed. Large backend modules remain under no-growth caps. |
| Verification and release controls | 20% | 99 | Backend coverage, frontend all-source coverage, lint, query budgets, migrations, browser workflows, responsive checks, and production image construction are CI gates. |
| Build and operations | 15% | 96 | Python matches the image in CI, Gunicorn is pinned, the image builds and passes `pip check`, and a logical dump/restore drill is executable in CI. Live provider backup settings remain an operator verification. |

Weighted score: **97.95, rounded to 98**. There are no known repository release
blockers. The remaining two points are operational evidence and the existing
large-module decomposition backlog, rather than a failing implementation gate.

### Remediation delivered

- Corrected every existing backend query-budget failure without raising query
  limits. Landing publication now loads root history once, program metrics use
  narrow read models, quota checks aggregate in one statement, and serializers
  reuse loaded scalar relationships.
- Made timer completion and derived duration statistics atomic. Event payloads
  are captured before commit, row locks are reused only for the lifetime of their
  transaction, and rollback/lock-lifetime regressions cover both boundaries.
- Replaced the unbounded analytics query dictionary with a TTL-swept, byte- and
  entry-bounded LRU. Production and staging bypass this process-local optional
  cache so separate workers cannot serve stale results after another worker mutates data.
- Fixed completion-state memoization and added stable-prop transition tests.
  Extracted navigation, account settings, landing fallback content, timeline view
  models, API-boundary tests, and behavior-focused session test files.
- Made backend CI unconditional for pull requests, consolidated duplicate backend
  executions into one coverage run, included end-to-end tests, aligned Python
  3.12 with the image, and added dependency-audit, image, and restore-drill jobs.
  Frontend CI now requires a production dependency audit, zero-warning lint, an
  all-source coverage ratchet, and Playwright.
- Added real Chromium desktop/mobile coverage for UI login, goal navigation,
  session activity rendering, completion, reload persistence, and viewport
  overflow. That work exposed and fixed missing Flask SPA deep links, static assets
  consuming the global rate limit, and blocked declared font sources.
- Pinned Gunicorn, removed its competing Docker install, fixed the Docker context,
  updated vulnerable Click/Axios/React Router dependencies, and removed dead
  compatibility wrappers plus generated coverage/bytecode from source control.
- Added `scripts/check_backup_restore.py`, which refuses non-local or non-test
  sources, restores a custom-format dump into a random database, checks table and
  Alembic parity, and force-removes the disposable database in `finally`.

### Verification summary

- Complete backend suite: **958 tests passed in 4m20s** with the unchanged 80%
  gate and **81.38%** measured services/blueprints coverage.
- Frontend unit/component suite: **267 files / 1,165 tests passed**; measured
  all-source coverage is **63.87% statements, 58.07% branches, 60.32% functions,
  and 66.08% lines**, with stable ratchets just below those observed values.
- Concurrent local developer pass: **958 backend tests and 1,165 frontend tests
  passed in 3m21s**. The backend and frontend inventories run together and retain
  separate exit statuses; the backend remains the critical path.
- Chromium: desktop and mobile production workflows passed in **7.3 seconds**
  against the real Flask app and a separately created, automatically removed
  PostgreSQL database.
- Production image: built successfully; its dependency graph passes `pip check`
  and contains pinned Gunicorn 26.2.0 and patched Click 8.3.3.
- Dependency audits: zero known production npm vulnerabilities and zero known
  production Python vulnerabilities.
- Restore drill: passed through the canonical runner in **1.91 seconds** and
  removed the restored database.

The sections below preserve the 2026-09-07 baseline and explain why the original
score was 75 before this remediation.

## Overall assessment

**75/100 (B): a substantial, well-tested application with unresolved release-gate,
cache, and operational-evidence gaps.** This is an engineering assessment of the
repository, not certification of the deployed service. Production application code
was not changed during this audit; the accompanying implementation improves test
execution without removing tests or relaxing the coverage floor.

Scoring rubric: A = 85–94, S = 95–97, S+ = 98–100. S+ also requires no known
release-blocking defects, passing mandatory gates, and demonstrated deployment and
recovery checks; a numerical average alone cannot qualify a release.

| Dimension | Weight | Score | Basis |
| --- | ---: | ---: | --- |
| Correctness and domain boundaries | 25% | 78 | Strong service ownership and regression suites; completion memoization, cache consistency and newly visible query-cost gaps remain. |
| Security and tenant boundaries | 20% | 80 | Owned-root checks, cookie/CSRF handling, production config validation and bounded analytics reads; no penetration test or fresh dependency-advisory verification in this audit. |
| Maintainability | 20% | 72 | Clear architectural map and no-growth policies, but the frontend gate fails and large-module/compatibility debt remains. |
| Verification and release controls | 20% | 70 | Large passing frontend suite and coverage/migration CI; query instrumentation blind spot, workflow trigger omissions, missing frontend lint gate and browser-level verification gaps. |
| Build and operations | 15% | 72 | Successful Vite build, health endpoints, non-root backend image and runbooks; reproducibility and recovery evidence are incomplete. |

Weighted result: 74.7, rounded to 75. Scores deliberately distinguish present
controls from aspirational policy. Confidence is moderate: this was a broad source
and local verification audit, not an exhaustive review of every endpoint or live
infrastructure.

## Prioritized findings

### 0. P1 — Backend query-budget instrumentation missed API SQL

The original `tests/conftest.py` patched the `models.get_engine` re-export, while
`get_scoped_session()` resolves the defining module's `models.base.get_engine`.
The query counter listened to the fixture engine; API requests could use another
engine. The revised fixture binds both paths to the same engine and adds an
explicit readiness-request counter regression.

The final complete 914-test run with correct instrumentation reports **904 passed and
10 failed**, with **80.76% coverage**. All ten failures are query counts above existing
budgets, not timeouts:

| Operation | Observed statements | Existing budget |
| --- | ---: | ---: |
| Publish landing example | 356 | 65 |
| Publish multiple landing examples | 542 | 115 |
| Add session activity | 30 | 16 |
| Start activity timer | 22 | 12 |
| Reset activity timer | 21 | 14 |
| Complete activity timer | 47 | 24 |
| Session details | 40 | 20 |
| Program metrics | 25 | 8 |
| Program metrics comparison | 26 | 10 |
| Session analytics summary | 13 | 12 |

Two additional failures in the intermediate run concerned circuit per-set progress comparisons (empty
`set_comparisons`) and filtered-set source index (`None` instead of `1`). Both tests
passed in the original-fixture and revised-fixture seven-test samples. Inspection
found that each assumes element zero of an unordered ORM metric relationship is
the best-set metric. Both now explicitly select `is_best_set_metric`; assertions
and behavior under test are unchanged. These observations do not establish a
production progress-calculation defect.

Keep the corrected instrumentation. Attribute each query to auth, eager/lazy
loading, serialization, mutation or event handling, then reduce unnecessary work.
Do not raise budgets solely to restore green CI. A passing coverage percentage does
not make this failing suite production-ready.

### 1. P1 — The mandatory frontend maintainability gate currently fails

`./run-tests.sh lint` reaches ESLint successfully (three warnings), then fails
`client/scripts/maintainability-audit.mjs` with eight findings:

- `client/src/AppRouter.jsx`: 699 lines, cap 676.
- `client/src/components/goalDetail/GoalTimelineView.jsx`: 494, cap 488.
- `client/src/components/legal/LegalDocument.jsx:5`: import ordering.
- `client/src/components/modals/SettingsModal.jsx`: 716, cap 650.
- `client/src/components/sessionDetail/__tests__/SessionActivityItem.test.jsx`: 1,645, cap 1,523.
- `client/src/content/landingContent.js`: 453, cap 450.
- `client/src/hooks/__tests__/useSessionDetailMutations.test.jsx`: 804, above the hard ceiling.
- `client/src/utils/api/__tests__/core.test.js`: 668, cap 665.

Frontend CI runs this gate, so this checkout is not ready for a green release
pipeline even though tests and the production build pass. Extract coherent
responsibilities and organize oversized tests by behavior; do not simply raise caps.

### 2. P2 — Session completion can stay stale in the side-pane model

`client/src/hooks/useSessionSidePaneViewModel.js:45` reads `session?.completed`,
but its memo dependency list at line 72 only includes the legacy nested
`session?.attributes?.completed`. If the top-level flag changes while listed inputs
remain stable, the memo retains the old completion state. Both the exhaustive-deps
and memoization ESLint warnings point to this mismatch. The existing hook test
checks initial nested state, not this transition.

Use one derived completion boolean in both the model and dependency list; cover
false→true and true→false rerenders with stable callbacks and collections.

### 3. P2 — Analytics query cache has no memory bound or cross-worker invalidation

`services/analytics_query_cache.py:21–42` removes an expired entry only when that
same key is read. Unique query specifications keep accumulating entries until an
invalidation event clears the dictionary. A local clock-controlled probe inserted
1,000 entries, advanced past their TTL, inserted one new entry, and observed **1,001
retained entries**. Expiration is a freshness check, not a memory eviction policy.

The cache and event bus are process-local, while `Dockerfile` defaults to two
Gunicorn workers. A mutation invalidates only the handling worker; another worker
can serve its previously cached result for the remaining 45-second TTL. This is a
code-level consistency finding, not a demonstrated tenant-isolation exploit.

Use a bounded cache with active/lazy sweeping and an explicit multi-worker
freshness contract. Reuse common cache infrastructure where appropriate: the
separate root analytics cache already supports Redis, while the query cache does
not. Keep distinct key and invalidation semantics where the read models differ.

### 4. P2 — Backend pull-request CI misses runtime and validation changes

`.github/workflows/backend-ci.yml:5–14` excludes `app.py`, `config.py`,
`extensions.py`, `validators/**`, `scripts/**`, `run-tests.sh`, and the backend
Docker build inputs. A PR confined to those files does not trigger these tests.
The unconditional main-branch push trigger detects problems only after merge.

Include every executable backend dependency in the PR filter, or remove the filter.

### 5. P2 — CI does not enforce several advertised checks

`.github/workflows/frontend-ci.yml:35–45` runs tests, responsive checks,
maintainability and build, but never `npm run lint`. ESLint warnings are also
non-failing locally. `client/vitest.config.js` defines coverage reporters but no
thresholds; frontend CI does not run coverage.

Backend coverage CI explicitly selects unit/integration/performance directories,
omitting the existing `tests/e2e/test_feature_workflows.py`. The coverage guard
checks those three directories only. Local `./run-tests.sh coverage` includes e2e.

Add lint to CI, ratchet meaningful warnings, establish an honest frontend coverage
baseline, and include all backend workflow tests in the canonical CI pass.

### 6. P2 — Build reproducibility and context hygiene are incomplete

`Dockerfile:29` installs unpinned Gunicorn outside `requirements.txt`. CI uses
Python 3.11, the production image uses 3.12, and this local run uses 3.13. The
backend container itself is not built by the checked-in backend CI workflow.

`Dockerfile:32` copies the full build context. `.dockerignore` excludes `venv/` but
not this repository's `fractal-goals-venv/` (422 MB locally), so a local root-context
Docker build can package the development environment. CI checkouts may avoid this
particular directory, but the build contract is unnecessarily environment-dependent.

Pin the application server with the production dependencies, align the primary
test runtime with production, test container builds, and explicitly exclude local
environments and generated artifacts from the build context.

### 7. P2 — Recovery is documented but not demonstrated in the repository

`docs/architecture/BACKUP_RESTORE_RUNBOOK.md` has unfilled backup verification
values and an empty restore-drill log. This does **not** prove backups are absent;
it means the repository does not substantiate recovery readiness.

Record an actual backup verification and timed restore drill before assigning
public-production/S+ confidence. Live provider settings were not inspected here.

### 8. P3 — Responsive checks do not exercise a browser

`client/scripts/responsive-audit.mjs` checks source patterns. The frontend suite
uses jsdom, and the backend e2e suite uses Flask's test client. These are useful
checks but cannot establish real layout, focus, mobile interaction, cookie/proxy,
or deployed asset behavior. No Playwright/Cypress browser suite was found.

Add a small real-browser release suite for login, goal/session creation, completion,
mobile overlays and session recovery. Keep the existing unit tests.

### 9. P3 — Size caps contain debt; they do not resolve it

`scripts/check_backend_maintainability.py` permits ten oversized backend modules,
including landing publication (1,634-line cap), progress (1,391), analytics engine
(1,344), and serializers (1,285). Route exception boilerplate is capped at 184
SQLAlchemy catches. Frontend exceptions also include large view/controller files.

Prioritize ownership seams with independent behavior and tests. Avoid pass-through
splitting solely to satisfy line counts.

Compatibility inventory: `models/__init__.py` still exposes `PracticeSession` and
three practice-session wrapper functions; session analytics and serializers retain
legacy embedded-payload fallbacks. These are removal candidates requiring consumer
and persisted-data checks, not proven dead code. Do not delete migration support
merely because its name contains “legacy.”

## Test-speed implementation

- Build the backend test schema once per pytest session and delete all ORM rows
  in reverse dependency order between tests, including sequence reset. Batch deletion
  in one transaction; unlike truncation it avoids repeated table/index storage
  replacement. Preserve real commits, rollbacks and
  independent connections so lock/concurrency tests retain their meaning.
- Reset the actual `models.base` scoped-session factory. The previous fixture wrote
  unused `models.engine` / `models._session_factory` aliases and created a new engine
  for every test without disposing it.
- Check the parsed database name and testing environment before destructive setup.
- Use four isolated Vitest threads instead of four forked workers. Keep every test
  file, mock cleanup, timeout, and coverage requirement.
- Add fixture regressions for repeated committed primary keys, cross-connection
  commit visibility, isolation of uncommitted data, and counting request SQL.
- Remove unordered metric-selection assumptions in two existing progress tests;
  keep all their assertions intact.
- Capture successful backend logs instead of streaming all domain events; failure
  reports retain logs and `-o log_cli=true` remains available for debugging.

## Verification record

- Baseline frontend: **259 files / 1,163 tests passed, 81.30 seconds**.
- Four-thread frontend comparison: **259 files / 1,163 tests passed, 67.37 seconds**
  (17% lower elapsed time in these local runs; hardware/load-dependent).
- Eight-thread comparison: **259 files / 1,163 tests passed, 66.67 seconds**.
  This marginal gain does not justify doubling the default worker count.
- Production Vite build: passed in **11.30 seconds**.
- ESLint: zero errors, three warnings; combined lint command fails maintainability.
- Responsive source audit: passed independently.
- Backend maintainability and coverage-configuration guards: passed.
- Original backend baseline: interrupted after **65 passed in 144.60 seconds** to
  implement the requested speed improvement. Its partial coverage is not a valid
  full-suite coverage measurement.
- Intermediate schema-once/truncation backend run: **909 tests, 897 passed / 12 failed, 581.12 seconds**,
  **80.77% services/blueprints coverage**. All existing tests ran, including e2e.
- Controlled seven-test sample (five concurrency cases plus the two progress cases):
  **13.41 seconds / seven passed** with the original fixture versus **7.49 seconds /
  seven passed** with schema-once/truncation (44% lower elapsed time).
- Idle test-database reset microbenchmark, five repetitions: truncation took
  **297–439 ms/reset**; batched dependency-ordered deletion took **4–20 ms/reset**.
  This compares reset overhead, not full-suite speed, and motivated the final fixture.
- Final controlled seven-test sample with row deletion: **seven passed in 4.87
  seconds**, versus **13.41 seconds** with the original fixture: **64% lower elapsed
  time / 2.75× faster**. This is a sample comparison, not an extrapolated full-suite claim.
- Final full-suite run with row deletion and five new regressions: **914 tests,
  904 passed / 10 query-budget failures, 269.35 seconds (4m29s), 80.76% coverage**.
  That is 54% less elapsed time than the intermediate 581.12-second truncation run,
  despite including five more tests. The original schema-per-test full run was not
  completed, so no original-to-final full-suite percentage is claimed.
- All five new fixture regressions, all concurrency cases, and the corrected
  progress tests pass. Existing query budgets, test selection, and the 80% coverage
  floor remain intact.
- Final sequential frontend comparisons without competing build/lint/backend jobs:
  **72.97 seconds with forks → 62.48 seconds with four isolated threads (14% lower
  elapsed time)**. Both runs passed **259 files / 1,163 tests**. These are the
  preferred frontend comparison figures; earlier runs had other checks running.

Not verified: live deployment, Docker build, fresh dependency advisories, browser
QA, and backup/restore drill. The fresh 80.76% result supersedes the historical
80.75% for this checkout; the configured 80% floor is unchanged.

## Path to S+

1. Restore the failing frontend gate, resolve the backend query-budget
   failures with the corrected instrumentation, and fix the completion-state regression.
2. Bound query-cache memory and verify multi-worker invalidation semantics.
3. Close CI trigger/test/lint gaps; build the actual production images on the
   production runtime and establish an honest frontend coverage ratchet.
4. Add focused browser release coverage and record backup/restore evidence.
5. Reduce the highest-risk ownership and compatibility debt using measured usage
   and regression tests. Re-score only after these changes are verified.

The test-speed implementation improves developer feedback. It does not by itself
remove the production defects or justify an S+ production rating.

Implementation review: all existing tests remain selected, five isolation/counter
regressions pass, and the two metric tests retain their assertions with explicit
metric selection. Removed unused fixture imports and ineffective session-reset
aliases; no alternative committed test runner or reset path was introduced. The
full backend command correctly exits nonzero on the ten now-visible query-budget
failures. This work is not an S+ release sign-off; the ordered remediation above
defines the remaining distance.

Suggested commit: `test: accelerate full suites and audit production readiness`
