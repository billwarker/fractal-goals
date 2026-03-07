# A+ / S Rank Roadmap

This roadmap turns the 50 quality recommendations into an execution plan.

## Phase 1: Foundation

1. Finish migration to a single frontend data-fetching model.
2. Make backend services the canonical boundary for validation and transaction invariants.
3. ~~Continue decomposing `GoalDetailModal.jsx` into orchestration hooks and view components.~~
4. ~~Move goal association persistence into dedicated mutation hooks.~~
5. ~~Move goal duration/chart loading into a dedicated hook.~~
6. ~~Standardize query keys in one module and remove string drift.~~
7. Expand application service coverage across goals, sessions, notes, and programs.
8. Shrink oversized blueprints, especially `goals_api.py`.
9. Isolate serialization from business logic.
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

21. Centralize payload normalization for activities, goals, notes, and sessions.
22. Make transaction ownership rules consistent across services.
23. Add stricter typing and return contracts to service methods.
24. Audit all endpoints for patch vs replace semantics.
25. Replace broad exception handling with narrower failure handling.
26. Standardize soft-delete behavior across the model/service layer.
27. Emit events only after successful commit and do so consistently.
28. Add stricter array/object shape validation for legacy payloads.
29. Reuse helper queries for owned-entity lookups inside a root.
30. Add query-budget tests for high-risk endpoints.

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

## Next Tranche

1. Expand application service coverage across goals, sessions, notes, and programs.
2. Shrink oversized blueprints, especially `goals_api.py`.
3. Centralize payload normalization for activities, goals, notes, and sessions.
4. Isolate serialization from business logic.
