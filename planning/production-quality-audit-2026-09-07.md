# Production quality audit — 2026-09-07

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
