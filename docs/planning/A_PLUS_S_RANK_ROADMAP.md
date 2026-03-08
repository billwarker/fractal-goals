# A+ / S Rank Roadmap

This roadmap turns the 50 quality recommendations into an execution plan.

## Current Status

- Completed: `43 / 50` (`86%`)
- Remaining: `7 / 50` (`14%`)
- Open items: `2, 10, 11, 35, 36, 37, 40`

## Active Focus

The roadmap is now concentrated in three areas:

1. Backend service/domain tightening
   Items `2` and `10`
   The main gap is not endpoint coverage anymore; it is finishing the move of validation/transaction/domain rules into clean backend service and domain helper boundaries.

2. Environment-independent backend testing
   Item `11`
   The repo now has reproducible DB bootstrap and CI coverage, but the remaining step is making local backend test runs fully ambient-free in all supported environments.

3. Final frontend correctness/polish pass
   Items `35`, `36`, `37`, `40`
   These are now about consistency and model quality:
   optimistic updates only where rollback is explicit, normalized goal/tree shapes, explicit structural vs execution goal modeling, and modal primitive consolidation.

## Open Item Notes

- `2`: Service boundaries are substantially improved. Remaining work is to make services the undisputed source of validation and transaction invariants everywhere, not just on the main refactored routes.
- `10`: Partial completion already exists via `goal_target_rules.py`, but it is not yet the full small domain-rules layer originally intended.
- `11`: CI and Docker paths are in place; local backend runs still need a more turnkey path that does not rely on environment assumptions.
- `35`: The codebase now uses invalidation heavily, but optimistic updates still need a formal bar and a small audit to ensure rollback is explicit wherever optimism exists.
- `36`: Several helpers normalize data, but there is not yet one reusable frontend layer that defines the canonical goal/tree node shape.
- `37`: The app behavior distinguishes structural and execution goals in practice, but the helpers/model layer still do this implicitly rather than explicitly.
- `40`: Modal primitives improved a lot, but layout/body/footer/header patterns are still not fully unified across the remaining modal surfaces.

## Phase 1: Foundation

1. ~~Finish migration to a single frontend data-fetching model.~~
2. Make backend services the canonical boundary for validation and transaction invariants.
3. ~~Continue decomposing `GoalDetailModal.jsx` into orchestration hooks and view components.~~
4. ~~Move goal association persistence into dedicated mutation hooks.~~
5. ~~Move goal duration/chart loading into a dedicated hook.~~
6. ~~Standardize query keys in one module and remove string drift.~~
7. ~~Expand application service coverage across goals, sessions, notes, and programs.~~
8. ~~Shrink oversized blueprints, especially `goals_api.py`.~~
9. ~~Isolate serialization from business logic.~~
10. Build a small domain-rules layer for completion, targets, and inheritance.

## Phase 2: Testing And Contracts

11. Make backend tests runnable without relying on ambient machine setup.
12. ~~Add a `doctor` mode to `run-tests.sh`.~~
13. ~~Add regression tests for every fixed refactor bug.~~
14. ~~Add integration tests for cache invalidation-sensitive flows.~~
15. ~~Add API contract tests for create/update validation behavior.~~
16. ~~Add transaction rollback coverage around nested writes.~~
17. ~~Add smoke coverage for `GoalDetailModal`.~~
18. ~~Add selection edge-case coverage for `ActivitySearchWidget`.~~
19. ~~Add tests for `GoalTreeService` pruning and visibility semantics.~~
20. ~~Split CI into frontend, backend-unit, backend-integration, and coverage jobs.~~

## Phase 3: Backend Correctness

21. ~~Centralize payload normalization for activities, goals, notes, and sessions.~~
22. ~~Make transaction ownership rules consistent across services.~~
23. ~~Add stricter typing and return contracts to service methods.~~
24. ~~Audit all endpoints for patch vs replace semantics.~~
25. ~~Replace broad exception handling with narrower failure handling.~~
26. ~~Standardize soft-delete behavior across the model/service layer.~~
27. ~~Emit events only after successful commit and do so consistently.~~
28. ~~Add stricter array/object shape validation for legacy payloads.~~
29. ~~Reuse helper queries for owned-entity lookups inside a root.~~
30. ~~Add query-budget tests for high-risk endpoints.~~

## Phase 4: Frontend Correctness

31. ~~Eliminate stale derived local state where query data can be source of truth.~~
32. ~~Remove effects that only mirror props into state.~~
33. ~~Resolve effect dependency warnings in touched files by restructuring logic.~~
34. ~~Prefer invalidation-based mutation hooks over local refresh functions.~~
35. Use optimistic updates only when rollback behavior is explicit.
36. Normalize tree and goal node shapes in one reusable frontend layer.
37. Model structural and execution goals explicitly in helpers.
38. ~~Expand target-card/activity-focus test coverage.~~
39. ~~Replace oversized multi-mode components with coordinator + subview patterns.~~
40. Consolidate modal primitives for consistent body/footer/layout behavior.

## Phase 5: Tooling And DX

41. ~~Add `frontend`, `backend`, and `all` commands to `run-tests.sh`.~~
42. ~~Add `lint` and `fix` commands to the same runner.~~
43. ~~Add maintainability checks for dead code, oversized files, and unused imports.~~
44. ~~Make backend test DB bootstrap reproducible, ideally via Docker or compose.~~
45. ~~Add a cheap pre-commit/pre-push verification path.~~
46. ~~Stop versioning generated artifacts and enforce it in `.gitignore`.~~
47. ~~Add ADRs for the Postgres-only move and React Query migration.~~
48. ~~Document canonical query keys, mutation invalidation policy, and service boundaries.~~
49. ~~Add import-order and component-size guardrails.~~
50. ~~Enforce a touched-files quality bar: no new lint warnings, tests for regressions, no generated artifacts.~~

## Completed Tranche 1

Completed in the current workspace:

- 6: canonical frontend query keys added in `client/src/hooks/queryKeys.js`
- 12: `doctor` mode added to `run-tests.sh`
- 13: regression coverage added for the recent refactor regressions
- 33: touched-file hook dependency warnings cleaned up in the active tranche
- 34: high-risk mutation/invalidation paths normalized in session and goal-detail flows
- 41: explicit `frontend` and `backend` runner commands added
- 42: `lint` and `fix` commands added to `run-tests.sh`
- 43: maintainability audit now checks dead-code drift, import order, and oversized source files
- 46: generated artifacts and local error outputs are now ignored in `.gitignore`
- 47: ADRs added for the Postgres-first and React Query architectural decisions
- 48: roadmap, query-key policy, and invalidation direction documented in-repo
- 49: component-size and import-order guardrails added to the maintainability audit
- 50: touched-file quality bar improved by removing artifact files and adding targeted validation
- 44: Docker Compose now boots both the primary and test Postgres databases, with runner commands for `db-up`, `db-down`, and `db-reset`
- 45: repo-tracked `pre-commit` and `pre-push` hooks now run `./run-tests.sh verify`, with an installer script in `scripts/install-git-hooks.sh`
- 16: nested goal-create transactions now have rollback tests that prove failed target sync does not partially persist goals
- 15: activities create/update endpoints now have explicit contract coverage for blank names, malformed metric/split shapes, and max-count validation
- 14: React Query integration coverage now exercises session-note cache coherence and grouped goal/session invalidation helpers
- 17: `GoalDetailModal` now has smoke coverage for view-mode rendering, close behavior, and create-mode save orchestration
- 18: `ActivitySearchWidget` now has edge-case coverage for preselection, whole-group linking, and ungrouped selection flows
- 19: `GoalTreeService` now has tests for pruning, activity-derived ancestor visibility, and micro-goal separation
- 20: CI is now split into dedicated frontend, backend-unit, backend-integration, and coverage jobs with Postgres-backed backend runs
- 4: `GoalDetailModal` association persistence and inline-created activity linking now live in `useGoalAssociationMutations`
- 5: goal duration chart loading and graph config assembly now live in `useGoalDurationModal`
- 3: `GoalDetailModal` orchestration now runs through dedicated hooks, including `useGoalDetailController`, reducing the modal to a thinner coordinator
- 38: target-card and activity-focus coverage now includes deleted-activity fallback behavior and focused target-card filtering by activity instance
- 39: `ActivityBuilder` now runs as a thin coordinator over `ActivityBuilderForm` plus extracted association, splits, and metrics subviews, with smoke coverage for create and edit-warning flows
- 7: application service coverage now spans goals, sessions, notes, and programs via `GoalService`, `SessionService`, `NoteService`, and `ProgramService`; goal CRUD, target mutations, manual completion, target evaluation, fractal list/create/delete, fractal tree loading, and selection-goal retrieval now route through services, reducing `goals_api.py` to 830 lines and sharing target-evaluation rules via `services/goal_target_rules.py`
- activity services now also own activity-group CRUD/reorder plus activity-goal and batch goal-association writes, reducing `activities_api.py` from 951 lines to 687 and adding integration coverage for the goal-association endpoints that drive the goal detail modal
- 8: the largest blueprint hotspots have been cut down substantially; `goals_api.py` dropped from 1836 lines to 830, and `activities_api.py` dropped from 951 lines to 573 after extracting activity-group CRUD, inherited goal-activity reads, and goal-activity-group link flows into services with integration coverage
- 21: shared payload normalization now lives in `services/payload_normalizers.py`, and activities, goals, notes, and sessions all route their write-path cleanup through it for IDs, JSON payloads, optional strings, and repeated list-shape normalization
- 9: complex response shaping for fractal summaries, goal selection payloads, target-evaluation responses, note/session history rows, session-goal view payloads, and goal analytics now lives in dedicated serializer helpers under `services/view_serializers.py` instead of being assembled inline inside service methods
- 22: service-owned transaction boundaries are now consistent across the main application services; `ProgramService` mutating methods now commit internally like `GoalService`, `ActivityService`, `SessionService`, and `NoteService`, and `programs_api.py` no longer double-commits after service calls
- 27: completion cascades now queue derived events until after commit; `completion_handlers.py` defers `target.achieved`, `goal.completed`, `goal.uncompleted`, `target.reverted`, and derived `program.updated` emissions until persistence succeeds, and `ProgramService.check_program_day_completion` queues day/block/program completion events with `root_id` context for post-commit emission
- 29: root-scoped lookup helpers now live in `services/owned_entity_queries.py`, and session, timer, activity, template, and program flows now share those helpers for owned session, activity-definition, activity-instance, activity-group, session-template, goal, and program queries instead of repeating the same `root_id` ownership filters inline
- 23: shared typed service contracts now live in `services/service_types.py`, and the main tuple-returning service boundaries in `ActivityService`, `GoalService`, `SessionService`, and `NoteService` now have explicit return annotations enforced by `tests/unit/services/test_service_contracts.py`
- 24: patch-vs-replace semantics are now explicit and regression-tested across activity metrics, activity goal associations, goal targets, session activity metrics, and session-template data, with create/update activity-group goal association support brought into schema-validated service flows
- 25: blanket route-level `except Exception` handling has been retired from the main service-backed blueprints in favor of narrower failure handling, with `activities_api.py`, `sessions_api.py`, `templates_api.py`, `programs_api.py`, `notes_api.py`, `timers_api.py`, `goal_levels_api.py`, `annotations_api.py`, `logs_api.py`, `auth_api.py`, and the service-backed/read-heavy portions of `goals_api.py` now using specific DB/error branches; the lone remaining broad catch in `timers_api.py` is the intentional ISO-datetime parser helper that converts arbitrary parse failures into `ValueError`
- 26: soft-delete behavior is now consistent for the `deleted_at`-backed model surfaces touched by the main app flows; templates, activity groups, activity instances, removed split definitions, goals, and whole fractals now soft-delete through service-backed paths, with fractal deletion also soft-deleting root-scoped sessions, activities, templates, metrics/splits, notes, annotations, and descendant goals instead of leaving active rows behind a deleted root
- 30: query-budget coverage now guards the session activities, session detail, goal tree, and session goals-view endpoints in `tests/performance/test_query_budgets.py`, with bounded ceilings based on the current eager-loading/query shape so future refactors cannot silently reintroduce N+1 blowups on these read-heavy surfaces
- 28: legacy payload-shape validation is now enforced across the previously permissive endpoints too; raw activity create/update, program day copy, and manual goal-completion payloads now validate object/array shapes through schema-backed parsing, completing the route inventory so malformed `targets`, `metrics`, `goal_ids`, `activity_ids`, `selected_points`, `sets`, `session_id`, `completed`, and `target_mode` payloads fail fast with regression coverage
- 32: prop-mirroring effects have been removed from the remaining modal, goal-detail, and planning surfaces that were only syncing props into local state; `useGoalForm`, `useGoalDetailController`, `useForm`, `GoalDetailModal`, `AnnotationModal`, `AuthModal`, `GoalModal`, `Programs.jsx`, `ProgramBuilder`, `ProgramDayModal`, `ProgramBlockModal`, `AttachGoalModal`, `MicroGoalModal`, `GroupBuilderModal`, `SettingsModal`, `DeleteConfirmModal`, `DeleteProgramModal`, `SelectActivitiesModal`, and `SessionModal` now reset through mount/unmount or explicit cancel/close paths instead of open-time sync effects
- 31 progress: `useActivityHistory` now reads prior activity instances through React Query with a canonical `activity-history` key instead of maintaining local fetched state, so `HistoryPanel` consumes a query-backed source of truth rather than a hand-rolled cache
- 31 progress: `AnnotationsList` now also reads visualization annotations through React Query with canonical `annotations` keys and invalidation on annotation-update events instead of running its own fetched-data cache and reload state machine
- 31 progress: `Selection.jsx` now reads fractals plus recent/per-root goal levels through React Query with canonical `fractals` and `goalLevels` keys, replacing four local fetch/cache states and moving create/delete flows onto shared query invalidation and cache updates
- 31 progress: `CreateSessionTemplate.jsx` now reads session templates, activities, and activity groups through shared React Query keys instead of owning its own fetch/loading state, and template save/delete/duplicate flows now refresh through invalidation-backed mutations
- 31 progress: `LogsModal.jsx` now derives paged log rows from shared `logs` query caches instead of holding its own fetched log list/loading state, and it resets via mount-seeded pagination while clear-log flows update shared query state directly
- 31: remaining major fetched-data mirrors have now been removed from `CreateSession.jsx`, `Analytics.jsx`, `ProgramDayModal.jsx`, `ProgramBuilder.jsx`, `AnnotatedHeatmap.jsx`, `AnnotatedChartWrapper.jsx`, `ActivitiesContext.jsx`, and `FractalGoals.jsx`; query-backed hooks and canonical keys now own those remote datasets instead of local component/context caches
- 1: the frontend data layer is now consistently query-first; `useFractalTree`, `useAllSessions`, and related dedicated hooks own read concerns, `GoalsContext` and `ActivitiesContext` have been reduced to mutation/selection facades, `SessionsContext` was removed, `ManageActivities.jsx` and `FractalGoals.jsx` now read sessions through shared hooks instead of bridge contexts, and `ActivityAssociator.jsx` no longer calls imperative fetch helpers just to refresh group state

## Next Tranche

1. Continue moving remaining low-level business rules out of route modules and into shared service/domain helpers.
2. Normalize remaining frontend state surfaces that still mirror query data into local state.
3. Remove effects that only mirror props into state on the remaining session and planning surfaces.
