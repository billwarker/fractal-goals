# Flexible Goal Hierarchy (Idea 2)

## Context

The app currently enforces a strict parent-child adjacency rule for macro goals: Ultimate → Long → Mid → Short → Immediate, one level at a time. This is bureaucratic friction — a user with an Ultimate goal should be able to attach a Short Term child directly without being forced to create intermediate levels they haven't thought through yet.

The fix is to allow any macro goal to have a child at any lower-rank level. The backend already supports this (rank comparison, not adjacency). The enforcement lives almost entirely in the frontend's `getChildType()` map. The execution tier (Immediate → Micro → Nano) stays strictly enforced.

## DB Schema Grade: C+

The schema is technically ready for flexible hierarchy (`parent_id` is just a FK, rank ordering is application-layer). However `goal_type_utils.py` has a depth-based fallback that infers goal type by counting tree depth — this breaks if levels are skipped and must be removed after a one-time migration.

---

## Implementation Plan

### Phase 1: Backend — Remove Depth Fallback (Migration)

**File:** `services/goal_type_utils.py`

The `get_canonical_goal_type()` function falls back to counting tree depth if a goal has no `level_id`. This is incompatible with skipped levels.

Steps:
1. Write an Alembic migration that queries all goals where `level_id IS NULL` and assigns the correct `level_id` based on the current depth-inference logic (one-time backfill).
2. After migration, update `get_canonical_goal_type()` to remove the depth-based fallback. If `level_id` is null, log a warning and return `None` rather than guessing.
3. Update `is_nano_goal()` and `is_micro_goal()` in `services/goal_domain_rules.py` to handle `None` gracefully.

**Critical files:**
- `services/goal_type_utils.py` — remove depth fallback (lines 6–44)
- `services/goal_domain_rules.py` — guard `is_nano_goal()`, `is_micro_goal()` (lines 21–26)
- `migrations/` — new Alembic revision for the backfill

---

### Phase 2: Backend — Path Monotonicity Validation on Create and Move

Simply checking `child.rank > parent.rank` is insufficient. It would allow structurally incoherent paths like:

```
Long Term Goal (rank 1) → Short Term Goal (rank 3) → Mid Term Goal (rank 2)
```

The rank sequence from root to leaf must be **strictly increasing** at every step. Add a new validation method `_validate_ancestor_rank_monotonicity(new_goal_level, parent)` to `goal_service.py`:

**Algorithm:**
1. Walk up the ancestor chain from `parent` to root (using the existing loop pattern from `note_service.py` lines 217–221 and `get_root_id_for_goal()`).
2. Collect each ancestor's rank in order (root → parent).
3. Assert the sequence is strictly increasing, AND that `new_goal_level.rank` is greater than `parent.level.rank`.
4. If any ancestor has a rank ≥ the next node's rank, return a validation error naming the conflicting levels.

**Apply this check in:**
- `create_fractal_goal_record()` (lines 778–861) — after resolving `level_id` and loading parent
- `create_global_goal()` (lines 664–760) — same position
- `move_goal()` (lines 1362–1425) — replace the current single-step rank check (lines 1410–1412) with the full path check

**Execution tier exception:** If new goal type is `MicroGoal` or `NanoGoal`, skip the monotonicity check and keep the existing type-specific parent requirement in `validators.py` (MicroGoal needs ImmediateGoal parent, NanoGoal needs MicroGoal parent). The strict execution tier is enforced separately.

**Critical files:**
- `services/goal_service.py` — new `_validate_ancestor_rank_monotonicity()` method; applied in create and move paths
- `validators.py` — `GoalCreateSchema.validate_parent_type_constraints()` (lines 331–350) unchanged for execution tier
- `services/goal_domain_rules.py` — reuse `_get_goal_level_rank()` pattern

No schema changes needed.

---

### Phase 3: Frontend — Replace `getChildType()` with `getValidChildTypes()`

**File:** `client/src/utils/goalHelpers.js`

Replace the hardcoded adjacency map with a rank-based lookup using the already-available levels data from `GoalLevelsContext`.

```js
// Replace:
export const getChildType = (parentType) => { /* strict map */ }

// With:
export const getValidChildTypes = (parentType, levels) => {
  // levels: array from GoalLevelsContext, sorted by rank
  // execution tier stays strict
  if (parentType === 'ImmediateGoal') return ['MicroGoal'];
  if (parentType === 'MicroGoal') return ['NanoGoal'];
  if (parentType === 'NanoGoal') return [];

  const parentLevel = levels.find(l => canonicalType(l.name) === parentType);
  if (!parentLevel) return [];
  return levels
    .filter(l => l.rank > parentLevel.rank && !isExecutionLevel(l))
    .map(l => canonicalType(l.name));
};
```

Keep `getChildType()` as a deprecated shim (returns first result of `getValidChildTypes`) to avoid breaking callsites in one pass. Migrate callsites in Phase 4.

**Critical files:**
- `client/src/utils/goalHelpers.js` — lines 16–27

---

### Phase 4: Frontend — Level Dropdown in GoalDetailModal Create Mode

**File:** `client/src/components/GoalDetailModal.jsx`

Currently in create mode, `goalType` is derived by calling `getChildType(parentGoal.type)` and is fixed. Change this to:

1. Compute `validChildTypes = getValidChildTypes(parentGoal.type, levels)` using `GoalLevelsContext`.
2. Add local state: `const [selectedChildType, setSelectedChildType] = useState(validChildTypes[0])`.
3. If `validChildTypes.length > 1`, render a level selector dropdown in the form header area (above the name field), using the existing level color/name display from `GoalLevelsContext`. Pre-selected to the adjacent next level (first item, which should be sorted by rank ascending).
4. If `validChildTypes.length === 1` (execution tier, or single valid option), no dropdown — keep current behavior.
5. Pass `selectedChildType` as the `type` in the create payload.

The dropdown should use existing level color styling via `getGoalColor` / `getLevelByName` from `GoalLevelsContext` so it's visually consistent.

**Critical files:**
- `client/src/components/GoalDetailModal.jsx` — lines 104–113 (type derivation), line 252 (childType)
- `client/src/contexts/GoalLevelsContext.jsx` — `getLevelByName()`, `getGoalColor()` (lines 87–191) — reuse, don't duplicate

---

### Phase 5: Frontend — Update Remaining `getChildType()` Callsites

Four callsites use `getChildType()` and each needs a targeted update:

1. **`FractalGoals.jsx` `handleAddChildClick()`** (line 152): Change to use `getValidChildTypes()`. If multiple valid types, the dropdown in GoalDetailModal handles selection — no change needed here beyond passing `parentGoal` correctly.

2. **`GoalDetailModal.jsx`** (line 252, `childType` used for "Add Child" button label): This now uses `selectedChildType` from Phase 4 state, or the first valid type. The "Add Child" button label becomes generic ("Add Child Goal") when multiple levels are valid, since we can't know which level until the user opens the create modal.

3. **`GoalModal.jsx`** (line 42): Update to use `getValidChildTypes()[0]` as the default, same as current behavior.

4. **`flowTreeGraphUtils.js`** (line 112): Used to decide whether to render an "Add Child" button on a node. Change to: show the button if `getValidChildTypes(nodeType, levels).length > 0`. The label can be "Add Child" generically.

---

### Phase 6: Frontend — Update Flow Tree Node "Add Child" Label

**File:** `client/src/components/flowTree/flowTreeGraphUtils.js` and `FlowTree.jsx`

The node currently shows "+ Add {childType}" (e.g., "+ Add LongTermGoal"). With flexible hierarchy this label should be "+ Add Child Goal" for macro goals with multiple valid children, since the level is chosen in the modal.

Execution-tier nodes still show the specific label ("+ Add Nano Goal") since there's only one valid child type.

---

### Phase 7: Tests

**Backend:**
- Add tests to `tests/` for `create_fractal_goal_record` and `create_global_goal` verifying:
  - A ShortTermGoal can be created as a child of an UltimateGoal (skip 2 levels) ✓
  - A MidTermGoal cannot be created as a child of a ShortTermGoal (wrong rank direction) ✗
  - A MidTermGoal cannot be created as a child of a ShortTermGoal that is itself a child of a LongTermGoal — i.e. path Long(1) → Short(3) → Mid(2) is rejected ✗
  - A valid skipped path Long(1) → Short(3) → Immediate(4) is accepted ✓
  - MicroGoal still requires ImmediateGoal parent (execution tier unchanged)
  - NanoGoal still requires MicroGoal parent (execution tier unchanged)
  - `move_goal()` rejects a move that would create a non-monotonic ancestor path

**Frontend:**
- Add tests for `getValidChildTypes()` covering macro flexibility and execution tier strictness
- Update existing GoalDetailModal tests that snapshot or assert on the hardcoded child type label

---

## Key Files Summary

| File | Change |
|---|---|
| `services/goal_type_utils.py` | Remove depth-based fallback after migration |
| `services/goal_domain_rules.py` | Guard is_nano_goal/is_micro_goal for None |
| `services/goal_service.py` | Add rank validation in create paths |
| `validators.py` | Keep execution tier type constraints |
| `migrations/` | New revision: backfill level_id for null goals |
| `client/src/utils/goalHelpers.js` | Replace getChildType() with getValidChildTypes() |
| `client/src/components/GoalDetailModal.jsx` | Level dropdown in create mode |
| `client/src/contexts/GoalLevelsContext.jsx` | Reuse getLevelByName, getGoalColor (no changes) |
| `client/src/pages/FractalGoals.jsx` | Update handleAddChildClick callsite |
| `client/src/components/modals/GoalModal.jsx` | Update getChildType callsite |
| `client/src/components/flowTree/flowTreeGraphUtils.js` | Update add-child button logic and label |

## Verification

1. Create an UltimateGoal. Click "Add Child Goal" — dropdown shows Long Term, Mid Term, Short Term, Immediate. Select Mid Term → GoalDetailModal opens, creates a MidTermGoal child.
2. Verify the flow tree renders the UltimateGoal → MidTermGoal edge correctly with no phantom nodes.
3. Create an ImmediateGoal — "Add Child" offers only MicroGoal (no dropdown). Execution tier unchanged.
4. Run backend tests: `./run-tests.sh backend`
5. Run frontend tests: `./run-tests.sh frontend`
6. Check the goals page tree view with "Show Micro & Nano" toggled on/off — no regressions.
