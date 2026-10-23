# Analytics history performance and deep-link stability

## Initial audit and completion criteria

The initial read path was B-level for this workload: bounded responses and correct comparison
semantics, but circuit section serialization performed lazy reads, and optional comparison scope
predicates encouraged a session-first query plan. The database already has the required activity
and session indexes; no migration is needed. Product behavior fell short because activity/session
charts rendered partial history and redrew as pages arrived.

The S+ target for this change is a chart that appears only with complete evidence, early deep-link
fetching, recoverable continuation failures, bounded circuit reads, preserved comparison semantics,
measured performance improvement, and regression coverage through the real browser route.

## Implementation review

- Analytics starts history reads for a Progress deep link before resolving the activity catalog.
- Activity/session panels receive continuation state and withhold the chart until every page arrives,
  including between requests. Goal panels retain their independent read state.
- Failed continuations expose Retry and resume the missing page without discarding loaded evidence.
  The page notice keeps steady loading wording between requests; it no longer promises incremental charts.
- History uses the existing maximum of 200 sessions, with the unchanged 500-instance response cap.
  Instance continuation still takes priority over the next session window.
- Circuit runs, rounds, and members load in bulk; each member's slot joins its member read. Three
  queries cover the regression fixtures; SQLAlchemy chunks larger collections into batches.
  A circuit-free window pays one fixed run lookup. The power-account query budget changes
  from 14 to 15 for that fixed lookup; tests guard 0, 1, 3 and 12 runs with multiple rounds and slots.
- Predecessors start from the target activity's indexed instances. A lateral session lookup with
  `OFFSET 0` preserves that access order despite optional template/program-day filters. Existing
  completion preference, same-session exclusion, time/ID ordering, set signatures and soft-delete
  constraints remain in the SQL. The old candidate-query implementation is replaced.
- The obsolete `loadingMoreEvidence` adapter field is removed; completeness owns chart visibility.

## Measured local evidence

One comparison run against the same development fractal with 165 active sessions, using read-only
transactions. Baseline methods were loaded from HEAD (`df41483c`) into the measurement process; no tracked
files or database rows were replaced. Each service call used a fresh ORM transaction. SQL counts
exclude the transaction setup and subsequent EXPLAIN. Times include service reads and serialization,
but exclude HTTP/network/browser time. These are local observations, not production latency promises.

| Read path | Requests | Service time total | SQL statements per page | JSON bytes total |
| --- | ---: | ---: | --- | ---: |
| Baseline, 50 sessions | 4 | 4,276.7 ms | 273 / 57 / 66 / 36 | 1,879,453 |
| Baseline, 200 sessions | 2 | 4,874.8 ms | 375 / 368 | 2,010,161 |
| Optimized, 200 sessions | 2 | 1,371.5 ms | 33 / 26 | 2,010,161 |

The final path is about 68% faster than the original 50-session path in this run and 72% faster
at equal page size. Larger session windows repeat more session metadata on instance-continuation
pages: about 7% more total JSON here. The unchanged instance cap still bounds each response's
activity evidence. A first optimized response contained 1,336,367 JSON bytes; the second 673,794.

First-page predecessor `EXPLAIN (ANALYZE, BUFFERS)` at equal 200-session page size:

| Plan | Execution time | Shared buffer hits |
| --- | ---: | ---: |
| Baseline | 1,544.485 ms | 1,646,208 |
| Optimized | 78.552 ms | 63,555 |

The 50-session baseline predecessor took 889.339 ms with 941,830 shared buffer hits. The optimized
plan scans activity candidates before looking sessions up by primary key.

Production build: Analytics 323.5 KiB gzip JavaScript, versus the handoff's 323.6 KiB. Sessions
remains 234.2 KiB; other route budgets pass. No bundle allowance was raised for this change.

## Validation and remaining distance to S+

- Full frontend suite: 384 files / 2,034 tests passed before the final small state-propagation and
  notice cleanup; focused tests cover those final changes (26 checks across the five affected
  suites after removing a redundant loading-state case).
- Desktop and mobile Chromium: deep-link evidence starts while the catalog is held; no canvas is
  mounted during continuation or after failure; Retry resumes history and renders the completed chart.
- Progress comparison/chart APIs and query budgets: 47 checks passed before reaching the identified
  power-account budget failure. After its documented fixed-query adjustment, analytics pagination,
  power-account budgets and history scaling passed all 39 checks.
- New circuit scaling regression: all four cases passed, including slot-based set member identities.
- Complete canonical backend run: all 1,646 tests passed in 531 seconds, including the 10,000-session
  history-scaling timing check. No timing threshold was relaxed. Both backend CI quality-gate tests
  also passed independently, and the canonical runner's seven MCP adapter tests passed.
- Final production build, ESLint (including the browser regression) and responsive checks pass.
  Backend type checking retains the same 15 baseline errors.
- Repository maintainability still fails on existing oversized files (including the unchanged
  572-line Analytics page), import ordering, an undefined surface-hover token, and the bespoke
  badge selector budget. Those findings are outside this change and remain production-quality debt.

The scoped implementation meets its behavior, performance and regression criteria. S+ certification
for the whole repository additionally requires resolving the existing static-quality debt and
production workload measurements. This change does not claim to eliminate the cost of loading
complete lifetime history; activity-specific server reads or a complete-history aggregate read
model would be a separate optimization for much larger accounts.

Suggested commit: `perf(analytics): Stabilize deep-linked charts and accelerate history reads`
