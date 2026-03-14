# Goal Completion Session Attribution

## Problem

Manual goal completion from session detail does not persist which session the completion happened in. Targets already have `completed_session_id` for this purpose, but Goals do not. The sessions page must infer "completed in this session" via timestamp heuristics (`completed_at` between `session_start` and `session_end`), which is fragile — especially for incomplete sessions that have no `session_end`.

## Solution

Add `completed_session_id` to the `Goal` model, mirroring the existing pattern on `Target`.

---

## Changes Required

### 1. Model — [models/goal.py](file:///Users/will/Projects/fractal-goals/models/goal.py)

Add to the `Goal` class (after `completed_at` on line 110):

```python
completed_session_id = Column(String, ForeignKey('sessions.id', ondelete='SET NULL'), nullable=True)
```

Add a relationship (near the other relationships around line 139):

```python
completed_session = relationship("Session", foreign_keys=[completed_session_id])
```

> [!IMPORTANT]
> This requires a forward-reference to `Session`. The `Target` model already does `completed_session = relationship("Session", foreign_keys=[completed_session_id])` (line 221), so this pattern is established.

### 2. Migration

Generate an Alembic migration adding the `completed_session_id` column to the `goals` table with a foreign key to `sessions.id` (`ondelete='SET NULL'`). Nullable, no default.

### 3. Service — [services/goal_service.py](file:///Users/will/Projects/fractal-goals/services/goal_service.py)

In `update_goal_completion` (line 1089):

- Accept `session_id` from the `data` payload (optional).
- When completing (`goal.completed = True`), set `goal.completed_session_id = data.get('session_id')`.
- When un-completing, clear it: `goal.completed_session_id = None`.
- Include `session_id` in the event payload when present.

```diff
 goal.completed_at = datetime.now(timezone.utc) if goal.completed else None
+goal.completed_session_id = data.get('session_id') if goal.completed else None
```

### 4. Serializer — [services/serializers.py](file:///Users/will/Projects/fractal-goals/services/serializers.py)

In `serialize_goal` (line 140), add `completed_session_id` to the output:

- Top-level: `"completed_session_id": getattr(goal, 'completed_session_id', None)`
- Inside `attributes`: same field

Place it adjacent to `completed_at` in both locations.

### 5. Frontend API call

Find the mutation that calls the goal completion endpoint from session detail. It currently sends `{ completed: true/false }`. Update it to also send `session_id` when completing from within a session context.

Locate this by searching for the completion toggle in session detail — it flows through the goals API (`PUT /api/goals/<id>` or similar) and only sends `{ completed }`. The session ID is available in the session detail context.

### 6. Frontend display — [SessionCardExpanded.jsx](file:///Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCardExpanded.jsx)

In the `completedGoals` derivation (lines 219–280), goal-level completion attribution can now use explicit linkage instead of (or in addition to) the timestamp heuristic:

```javascript
// Add this check alongside the existing isTimestampWithinSession check:
const isExplicitlyLinked = goal.completed_session_id === session.id
    || goal.attributes?.completed_session_id === session.id;
```

The `isTimestampWithinSession` fallback can remain for backward-compat with goals completed before this migration.

---

## Scope Boundary

**Not in scope** for this change:

- Serializing ancestor goals in session list payloads (the existing `hasCompletedDescendant` roll-up in `SessionCardExpanded` handles this already)
- Backfilling `completed_session_id` for historically completed goals (timestamp heuristic remains as fallback)
- Auto-completion paths in `completion_handlers.py` — these complete goals via target fulfillment and should also set `completed_session_id` if a `session_id` is available in context. This is a worthwhile follow-up but not blocking.

## Verification

1. **Backend unit test**: Complete a goal via `update_goal_completion` with `session_id` in payload → assert `goal.completed_session_id` is set. Un-complete → assert it's `None`.
2. **Serializer test**: Assert `completed_session_id` appears in `serialize_goal` output.
3. **Frontend test**: In `SessionCardExpanded`, a goal with `completed_session_id === session.id` should appear in the "Completed in Session" section without relying on timestamp matching.
4. **Manual test**: Complete a goal from session detail → navigate to sessions list → confirm the goal shows under "Completed in Session" for that session card.
