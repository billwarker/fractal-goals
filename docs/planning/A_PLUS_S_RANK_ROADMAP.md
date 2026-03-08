# A+ / S Rank Roadmap

This roadmap turns the 50 quality recommendations into an execution plan.

## Phase 1: Foundation

1. Finish migration to a single frontend data-fetching model.
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

31. Eliminate stale derived local state where query data can be source of truth.
32. Remove effects that only mirror props into state.
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
- 31/32 progress: the session-detail surfaces are now shedding prop-mirroring state incrementally; `HistoryPanel`, `NotesPanel`, `ActivityAssociationModal`, `GoalsPanel`, and `SessionActivityItem` no longer depend on sync effects for view-mode/selection defaults, `ActiveSessionContext` now treats `localSessionData` as a draft overlay on top of normalized query data instead of maintaining a permanent mirrored copy, `GoalDetailModal` now reads goal metrics directly from query data, `useGoalDetailController` resets per-goal controller state without an initialization effect, `AnnotationModal` now uses a close-reset draft instead of mirroring `initialContent`, `GoalModal` now mounts with seeded initial state instead of resetting fields in an effect, and `Programs.jsx` now derives the route-selected program instead of syncing it into local state

## Next Tranche

1. Continue moving remaining low-level business rules out of route modules and into shared service/domain helpers.
2. Normalize remaining frontend state surfaces that still mirror query data into local state.
3. Remove effects that only mirror props into state on the remaining session and planning surfaces.
