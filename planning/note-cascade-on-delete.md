# Notes follow what they were written on — cascade on delete

## Context

A note belongs to the thing it was written on: a session, an activity in a session, a goal, a program or a program date. Today, deleting that thing mostly leaves its notes live:

| Deleted | Mechanism | What happens to its notes today |
|---|---|---|
| Session (`services/_session_updates.py:314`) | soft delete (`deleted_at`) | **Stay live** — on the Notes feed under a badge linking to a deleted session; activity/set notes inside it too |
| Activity removed from a session (`services/session_activity_service.py:427`) | soft delete | **Stay live**, showing the removed instance's values |
| Goal subtree (`services/_goal_deletion.py:35`, `_goal_helpers._soft_delete_goal_subtree`) | soft delete | **Stay live** — goal notes, reviews and completion notes; clicking the name opens nothing |
| Program (`services/_program_crud.py:312`) | hard delete | Erased by the `notes.program_id ON DELETE CASCADE` FK (permanent; relies on the DB enforcing FKs) |
| Circuit run / round (`circuit_service.py:468`, `circuit_round_operations.py:115`) | soft delete | Soft-deleted in the same transaction ✅ (the precedent) |
| Fractal (`_goal_helpers._soft_delete_root_entities`) | soft delete | Soft-deleted ✅ |

The DB `ON DELETE` rules only fire on hard deletes, and sessions, goals and instances are soft-deleted. Pins also break: a note *carried into* a deleted session or instance is used up and gone. Nothing restores deleted rows today.

**Outcome:** deleting anything takes the notes written on it along with it (soft, restorable as a unit); notes that only *refer* to it survive; pins delivered into a deleted target return to waiting; the user is told how many notes go before confirming; existing orphans are cleaned up.

## Grade of the current system: **C**

- **Right:** a consistent soft-delete model with `deleted_at` everywhere; circuits and fractal deletion already cascade to notes; feeds filter `Note.deleted_at`.
- **Wrong:** the three most common deletes (session, activity, goal) orphan notes; programs erase notes permanently while everything else soft-deletes; delivered pins are lost; delete dialogs never mention notes; no client cache refresh of notes after a delete; no test asserts any of it.

## S+ plan

### 1. One ownership rule, one helper — `services/note_ownership.py` (new)
A single predicate defines "notes owned by X", used both to count (for the dialogs) and to delete, so preview and effect can never disagree:

```python
def owned_notes_query(db, root_id, *, session_ids=(), instance_ids=(), goal_ids=()):
    # live notes of root_id where any of:
    #   Note.session_id IN session_ids                       (session, activity, set, circuit notes in it)
    #   Note.activity_instance_id IN instance_ids            (activity and set notes)
    #   Note.context_type == 'goal' AND Note.goal_id IN goal_ids   (goal notes, reviews, completions)
def count_owned_notes(...) -> int
def soft_delete_owned_notes(db, root_id, deleted_at, **targets) -> int
    # bulk UPDATE deleted_at = <the parent's exact deleted_at> (restore = clear rows with that stamp)
def release_pins_into(db, root_id, *, session_ids=(), instance_ids=()) -> int
    # carried_into_session_id / carried_into_instance_id pointing at the targets -> NULL,
    # so the pin waits for the next session/instance again (note_carry_forward._pending_query picks it up)
```

Explicitly **not** owned (kept): activity notes elsewhere that merely link `goal_id`; notes on an activity *definition* when that definition is deleted (past sessions still exist); notes in *other* sessions that were carried from the deleted one.

### 2. Call it from every delete path, in the same transaction, with the parent's timestamp
- `_session_updates.delete_session`: `soft_delete_owned_notes(session_ids=[id])` + `release_pins_into(session_ids=[id], instance_ids=<its instances>)`.
- `session_activity_service.remove_activity_from_session`: `instance_ids=[id]` + release pins into it.
- `_goal_deletion.delete_fractal_goal`: `_soft_delete_goal_subtree` returns the subtree → `goal_ids=[...]`.
- `_program_crud.delete_program`: delete the program's notes explicitly before `session.delete(program)` (hard, matching the program, and no longer dependent on FK enforcement).
- Circuits: refactor their two inline `UPDATE`s onto the helper (same behaviour, one rule).
- Fractal deletion already covers everything; leave it as is.

Read-side guard: `serialize_note_display` ignores a soft-deleted `note.goal` (no `goal_name`/badge for a goal that's gone), so surviving notes that only linked a deleted goal don't advertise it.

### 3. Tell the user before they delete
- New read-only endpoint `GET /api/<root>/notes/owned-count?session_id=|goal_id=|activity_instance_id=` → `{count}`, built on `count_owned_notes` (goal: whole subtree via `_collect_goal_subtree`).
- **Session** (`SessionDetailModals.jsx`, `pages/Sessions.jsx`): "Delete this session and its 4 notes? This can't be undone."
- **Goal** (`GoalDeleteConfirmSubView.jsx`): "…will be deleted, with 6 notes."
- **Activity in a session** (`SessionSection.jsx` / `SessionActivityItem.jsx`): removal stays one tap when the activity has no notes; when it has notes, confirm "Remove this activity and its 2 notes?". Counted locally from the session's notes cache (no request), so offline removal still works.
- Program delete dialog: same copy pattern.

### 4. Keep the client caches honest
- After session / goal / activity / program deletion, invalidate `queryKeys.allNotesRoot(rootId)`, `goalNotesRoot(rootId)`, and the session notes key; for programs also `programCalendarFeedRoot` (cells show date notes).
- Offline outbox (`client/src/offline/sessionOpHandlers.js`): the `ACTIVITY_REMOVE` optimistic handler also drops that instance's notes from the session-notes cache, so a queued removal hides its notes immediately.

### 5. Clean up existing orphans — Alembic data migration (down_revision `d4f6b8a0c2e3`)
Dialect-neutral correlated UPDATEs, each stamping the parent's `deleted_at`:
- notes whose `session_id` → a deleted session;
- notes whose `activity_instance_id` → a deleted instance;
- goal-context notes whose `goal_id` → a deleted goal;
- `carried_into_session_id` / `carried_into_instance_id` → deleted targets set to NULL.
Downgrade is a no-op (data repair). Idempotent (only touches `deleted_at IS NULL` rows).

### 6. Tests
- `tests/unit/services/test_note_ownership.py` (new): the predicate per target; kept-vs-owned cases (goal-linked activity note survives, definition notes survive); pins released; the timestamp equals the parent's.
- One integration test per delete path (session, activity removal, goal subtree, program, circuit regression): notes disappear from `/notes` feed, heatmap and goal notes; an unrelated note remains; count endpoint matches the number deleted.
- Migration test on a seeded DB with orphans: orphans soft-deleted, live notes untouched, second run changes nothing.
- Client: dialog copy shows counts (session, goal, activity-with-notes confirm, activity-without-notes no confirm); cache invalidation after delete; offline `ACTIVITY_REMOVE` hides the notes.

### Critical files
`services/note_ownership.py` (new) · `services/_session_updates.py` · `services/session_activity_service.py` · `services/_goal_deletion.py` · `services/_goal_helpers.py` · `services/_program_crud.py` · `services/circuit_service.py` · `services/circuit_round_operations.py` · `services/_serialize_notes_misc.py` · a notes blueprint route for `owned-count` · `migrations/versions/<new>_cascade_orphaned_notes.py` · `client/src/components/sessionDetail/SessionDetailModals.jsx` · `client/src/pages/Sessions.jsx` · `client/src/components/goals/GoalDeleteConfirmSubView.jsx` · `client/src/components/sessionDetail/SessionSection.jsx` · `client/src/offline/sessionOpHandlers.js` · delete mutations in `client/src/hooks/useSessionDetailMutations.js` and `client/src/contexts/GoalsContext.jsx`.

### Verification
1. `fractal-goals-venv/bin/python -m pytest tests/unit/services/test_note_ownership.py tests/integration -k "delete or note" -q`
2. `cd client && npx vitest run src/components/sessionDetail src/components/goals src/pages src/offline` and `npx eslint` on touched files.
3. Real app via the Playwright harness (`npm run build`, throwaway spec): write a session note and an activity note → delete the session (dialog says "2 notes") → Notes page no longer shows them; write a goal review → delete the goal → gone from Notes; pin a note, deliver it into a session, delete that session → the pin shows on the next open session.
4. Run the migration against a copy of a dev DB with known orphans; confirm counts before and after.

### After approval
Save this plan to `planning/note-cascade-on-delete.md` (per CLAUDE.md), then implement in the order 1 → 6.
