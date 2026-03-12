# Persistent Bidirectional Activity Inheritance

Activity inheritance currently only works in one direction (child → parent) and that direction is computed at read-time by `get_goal_activities` walking the goal tree downward. Parent → child inheritance is purely frontend state that doesn't survive a page reload.

This plan makes both directions persistent and backend-resolved.

## Proposed Changes

### Backend — Model & Migration

#### [MODIFY] [goal.py](file:///Users/will/Projects/fractal-goals/models/goal.py)

Add a new boolean column to the `Goal` model:

```python
inherit_parent_activities = Column(Boolean, default=False)
```

This follows the same pattern as the existing `completed_via_children` column.

---

#### [NEW] migration: `add_inherit_parent_activities_to_goals`

Alembic migration adding `inherit_parent_activities` (Boolean, nullable, server_default `false`) to the `goals` table. Modeled on the existing `a9912bb2692d_add_completed_via_children_to_goals.py` migration.

---

### Backend — Serializer & Validators

#### [MODIFY] [serializers.py](file:///Users/will/Projects/fractal-goals/services/serializers.py)

In `serialize_goal` (line 174 area), add `inherit_parent_activities` to the `attributes` dict, alongside `completed_via_children`:

```python
"inherit_parent_activities": goal.inherit_parent_activities,
```

---

#### [MODIFY] [validators.py](file:///Users/will/Projects/fractal-goals/validators.py)

- `GoalCreateSchema` (line 260): Add `inherit_parent_activities: Optional[bool] = False`
- `GoalUpdateSchema` (line 337): Add `inherit_parent_activities: Optional[bool] = None`

---

### Backend — Service Layer

#### [MODIFY] [goal_service.py](file:///Users/will/Projects/fractal-goals/services/goal_service.py)

In `update_goal`:
```python
if 'inherit_parent_activities' in data:
    goal.inherit_parent_activities = data['inherit_parent_activities']
```

In `create_goal` (the `_build_goal` path), pass through `inherit_parent_activities` from validated data.

---

#### [MODIFY] [activity_service.py](file:///Users/will/Projects/fractal-goals/services/activity_service.py)

Modify `get_goal_activities` (line 522–612) to add an **upward walk** when `goal.inherit_parent_activities` is `True`:

```python
# After processing direct + child activities (existing code)...

# NEW: walk upward to inherit parent's activities
if goal.inherit_parent_activities and goal.parent_id:
    parent = self.db_session.query(Goal).filter_by(
        id=goal.parent_id, root_id=root_id
    ).first()
    if parent:
        process_goal(parent, activities, is_inherited=True,
                     source_name=parent.name, direction='parent')
```

The `upsert_activity` function needs a small extension — add an `inherited_from_parent` field that is set when `direction='parent'`:

```python
# In the initial entry creation:
"inherited_from_parent": direction == 'parent' if direction else False,

# In the merge path: if we see the same activity from a parent direction
if direction == 'parent':
    entry["inherited_from_parent"] = True
```

> [!IMPORTANT]
> The upward walk is intentionally **one level only** (the immediate parent). We do NOT recursively walk to grandparents. This matches the existing UI checkbox behavior ("inherit from parent") and avoids circular walks.

---

### Frontend — Hooks

#### [MODIFY] [useGoalAssociationMutations.js](file:///Users/will/Projects/fractal-goals/client/src/hooks/useGoalAssociationMutations.js)

No changes needed — the `persistAssociations` function correctly filters by `isDirectActivityAssociation`. Parent-inherited activities returned from the backend with `has_direct_association: false` won't be re-persisted as direct associations.

---

#### [MODIFY] [ActivityAssociator.jsx](file:///Users/will/Projects/fractal-goals/client/src/components/goalDetail/ActivityAssociator.jsx)

1. **Initialize `inheritFromParent` from backend data** (currently line 66):
   ```diff
   -const [inheritFromParent, setInheritFromParent] = useState(goalType === 'NanoGoal');
   +const [inheritFromParent, setInheritFromParent] = useState(
   +    initialInheritParentActivities ?? goalType === 'NanoGoal'
   +);
   ```
   where `initialInheritParentActivities` is a new prop threaded from the goal's `attributes.inherit_parent_activities`.

2. **Persist the flag when toggling** — in `handleInheritFromParentChange`:
   ```js
   // After updating local state, persist the flag to the goal
   if (goalId) {
       await fractalApi.updateGoal(rootId, goalId, {
           inherit_parent_activities: checked
       });
   }
   ```

3. **Revert the `has_direct_association` fix** — with backend-resolved inheritance, the inherited parent activities are returned by `get_goal_activities` with `inherited_from_parent: true` and `has_direct_association: false`. They should NOT be marked as direct associations or sent through `persistAssociations`. Change line 368 back to `has_direct_association: false` since:
   - The backend's `get_goal_activities` will now resolve parent activities automatically
   - `persistAssociations` should not send them as direct associations

> [!WARNING]
> This means the toggle flow changes: instead of "add activities to local state + persist as direct associations," it becomes "persist the `inherit_parent_activities` flag + invalidate queries so the backend returns the resolved list."

---

### Frontend — Goal Detail Modal

#### [MODIFY] GoalDetailModal (or whichever component creates the `ActivityAssociator` props)

Thread the `inherit_parent_activities` attribute from the goal data through to `ActivityAssociator` as `initialInheritParentActivities`.

---

## Verification Plan

### Existing Tests

The existing test at [test_inherited_activities.py](file:///Users/will/Projects/fractal-goals/tests/integration/test_inherited_activities.py) covers child → parent inheritance and confirms that parent activities are NOT included when fetching from child (line 86: `assert act_root_id not in ids`). This assertion will need updating for goals with `inherit_parent_activities=True`.

### New Integration Tests

Add to `test_inherited_activities.py`:

1. **`test_parent_inheritance_when_flag_enabled`** — Create Root → Child hierarchy, associate activity with Root, set `inherit_parent_activities=True` on Child, fetch Child's activities, assert parent's activity appears with `inherited_from_parent=True` and `has_direct_association=False`.

2. **`test_parent_inheritance_flag_disabled_by_default`** — Verify that a goal with default settings does NOT inherit parent activities (existing test assertion at line 86 should still pass).

3. **`test_parent_inheritance_does_not_walk_grandparents`** — Create Root → Child → Grandchild, enable `inherit_parent_activities` on Grandchild. Verify Grandchild inherits Child's activities but NOT Root's.

4. **`test_parent_inheritance_duplicate_handling`** — Activity associated with both parent and child. With `inherit_parent_activities=True`, verify the activity shows `has_direct_association=True` and `inherited_from_parent=True`.

**Run command:**
```bash
cd /Users/will/Projects/fractal-goals && python -m pytest tests/integration/test_inherited_activities.py -v
```

### Frontend Hook Tests

Update `useGoalAssociationMutations.test.jsx` to verify that parent-inherited activities (with `has_direct_association: false` and `inherited_from_parent: true`) are correctly excluded from `persistAssociations`.

**Run command:**
```bash
cd /Users/will/Projects/fractal-goals/client && npx vitest run src/hooks/__tests__/useGoalAssociationMutations.test.jsx
```

### Manual Verification

1. Open a goal with a parent that has associated activities
2. Navigate to the Activity Associator (selector mode)
3. Check the "Inherit from Parent" checkbox
4. Verify the parent's activities appear with inheritance indicators
5. **Refresh the page**
6. Verify the checkbox is still checked
7. Verify the inherited activities still appear with correct indicators
8. Uncheck the checkbox, refresh, verify the activities are gone
