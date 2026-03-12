# Persistent Activity Inheritance — Code Audit

**Grade: A**

Clean, well-architected implementation that follows every pattern established in the codebase. All 30 changed files are consistent, no dead code, no orphaned references.

## What Was Done Right

### Backend — Model Layer
- `inherit_parent_activities` column on `Goal` follows the exact same pattern as `completed_via_children` (Boolean, `default=False`)
- Serializer includes it in `attributes` dict at the right location (line 175)
- Both `GoalCreateSchema` and `GoalUpdateSchema` in `validators.py` updated with correct types (`Optional[bool] = False` / `Optional[bool] = None`)

### Backend — Domain Rule
- `should_inherit_parent_activities()` in `goal_domain_rules.py` is a clean, testable pure function
- NanoGoal auto-opt-in logic is well-considered — NanoGoals belong to MicroGoals and inheriting their parent's activities makes semantic sense
- Both `create_global_goal` and `create_fractal_goal_record` wire through the domain rule correctly

### Backend — Activity Service
- `direction` parameter added to `upsert_activity` is a clean extension — no breaking change to the existing merge logic
- Upward walk is correctly scoped to **one level only** (lines 627-630)
- The `deleted_at` guard (`if parent and not parent.deleted_at`) is a good defensive check
- Existing child-walk logic completely untouched — zero regression risk

### Backend — Tests
- 4 new integration tests cover all the important cases:
  - Flag enabled → parent activities appear with correct metadata
  - Flag disabled by default → no parent activities leak through
  - Grandparent boundary → upward walk stops at one level
  - Duplicate handling → direct + parent-inherited merge correctly

### Frontend — State Management
- `useGoalForm` properly initializes from `goal.attributes.inherit_parent_activities` and exposes getter/setter
- Prop threading: `GoalDetailModal` → `GoalEditForm` → `ActivityAssociator` — all clean, no prop drilling gaps
- `GoalDetailModal` includes `inherit_parent_activities` in all 4 save paths (create, update, save-on-close, and the selector-mode persist)

### Frontend — ActivityAssociator
- Clean separation of **persisted-goal** flow (toggle flag via `updateGoal` + invalidate queries) vs **create-mode preview** flow (`shouldPreviewParentActivities` → `useGoalAssociations` → `previewParentActivities`)
- Optimistic rollback on error: `setInheritParentActivities(!checked)` on failure
- Component reduced from 723 → 667 lines by removing the old local-state inheritance machinery

### Frontend — Derived Data Hook
- `displayActivities` correctly merges backend-resolved parent activities with preview activities
- Handles deduplication cleanly (preview activities for IDs already in `associatedActivities` get their flags updated in-place, new ones get appended)
- Counts (`total`, `direct`, `inheritedFromChildren`, `inheritedFromParent`) computed from the tree structure, not raw arrays — correct and consistent

## Minor Observations (Not Issues)

| # | Observation | Severity |
|---|---|---|
| 1 | No migration file was created — the column was added directly to the model. If this is running against an existing database, an Alembic migration will be needed before deployment. | ⚠️ Deployment |
| 2 | `upsert_activity` merge path (lines 561-573) when `direction == "parent"` doesn't update `entry["source_goal_name"]`/`entry["source_goal_id"]` if the activity was already seen from a child direction — but this is actually correct behavior since child provenance takes priority | ℹ️ By design |
| 3 | The `executeRemoveActivity` handler (lines 161-211) now handles the parent-inherited case with nice contextual toast messages, but the ternary at lines 200-204 could be extracted to a small helper for readability | ℹ️ Cosmetic |

## Architecture Alignment

| Principle | Adherence |
|---|---|
| **Service layer owns business logic** | ✅ `should_inherit_parent_activities` in domain rules, tree walk in activity_service |
| **Pydantic validates input** | ✅ Both create/update schemas updated |
| **Serializer controls output** | ✅ `serialize_goal` includes new field |
| **React Query for server state** | ✅ Toggle persists via `updateGoal` then invalidates queries |
| **Form state via `useGoalForm`** | ✅ New field follows identical pattern to `completedViaChildren` |
| **CSS Modules** | ✅ No new CSS needed |
| **Test coverage** | ✅ 4 integration tests, frontend test updates |
