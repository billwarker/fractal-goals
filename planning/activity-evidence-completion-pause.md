# Tighten Activity Evidence Capture Around Goal Completion & Pause

## Context

On the goals view, a goal is shown as **active** when it has recent "activity evidence" — a completed activity instance, linked to that goal (or a descendant), whose effective completion timestamp falls inside the root's `active_goal_window_days` window (default 7, max 90). This is computed on demand, not stored.

Two problems exist today:

1. **Completed goals keep accumulating evidence.** Because activities can be linked to multiple goals, doing an activity in support of *other* goals also flips an already-completed goal back to "active". The intended behaviour is: once a goal is completed, no *new* evidence accrues to it; it stays active only until the pre-completion evidence ages out of the window, then naturally flips to inactive.
2. **Paused goals can still receive evidence around the pause.** Activity done while a goal is paused should never count toward it.

The root cause is an inconsistency between two evidence paths in `services/session_analytics_service.py`:

- `get_recent_evidence_goal_ids` (drives the tree's active/inactive flip) only checks `goal_suppresses_contribution(goal)` (current `frozen` flag) and **ignores the activity timestamp entirely** — so completed goals and timing-sensitive pause rules are not applied.
- `get_flowtree_session_metrics` (metrics overlay) already uses `resolve_contribution_goal(goal, timestamp, ...)`, which correctly excludes paused goals and goals completed *before* the activity.

Separately, the user wants the codebase to stop calling paused goals "frozen" — finishing a rename that is already half-done (the API, UX copy, and frontend normalization already prefer `paused`; the DB column, internal field access, serializer duplicate keys, and a legacy `/freeze` endpoint still say `frozen`).

### Decisions confirmed with the user
- **Completion cutoff:** an activity stops counting only if performed *after* `completed_at`. Pre-completion evidence still counts until it ages out (natural fade). Reuse existing `goal_was_completed_before`.
- **Pause semantics:** persist pause windows so activity performed *during* any pause never counts, even after the goal is resumed. This requires recording pause intervals (schema change), not just the current flag.

---

## Database Grade (current): B

Strengths:
- Clean, normalized many-to-many evidence model (`activity_goal_associations`) with soft-delete.
- Active/inactive is correctly computed, not denormalized — no stale-state risk.
- A reusable contribution-rules module (`services/goal_contribution.py`) already exists and is correctly applied in two of three paths.
- Completion state is richly modelled (`completed`, `completed_at`, `completion_source`, `completion_reason`, `manually_uncompleted_at`).

Weaknesses (why not higher):
- **Rule inconsistency:** the evidence path that drives the user-visible active/inactive flip skips the timestamp-aware contribution rules the other paths use — a correctness bug, not just polish.
- **Pause is point-in-time only:** `frozen`/`frozen_at` capture the *current* pause and clear `frozen_at` on resume, so historical pause windows are unrecoverable. Evidence-during-pause cannot be excluded after resume.
- **Terminology drift:** `frozen` vs `paused` coexist (DB + serializer emit both), a known half-migration that invites bugs.

### Target after this plan: S+
- One canonical, timestamp-aware contribution rule applied consistently across **all** evidence/metrics paths.
- Durable pause-interval history so "no evidence while paused" holds permanently, surviving resume.
- Single, unambiguous `paused` vocabulary end-to-end (DB → service → API → frontend), legacy `frozen` removed.
- Backfill + tests proving completed and paused goals fade/stay-inactive correctly.

---

## Plan

### Part A — Fix the evidence rule (core correctness)

The minimum fix for problem (1) and the live case of (2): make `get_recent_evidence_goal_ids` timestamp-aware and consistent with the metrics path.

**File:** `services/session_analytics_service.py` — `get_recent_evidence_goal_ids` (lines ~342-383)

- Load `goals_by_id` for the root (same pattern as `get_flowtree_session_metrics`, lines ~396-402).
- For each recent completed instance, resolve the activity's effective goals through `resolve_contribution_goal(goal, instance_timestamp, goals_by_id)` instead of the current `if goal and not goal_suppresses_contribution(goal)` check. Use the per-instance effective completion timestamp (`time_stop or updated_at or created_at`), which the query already selects but currently discards.
- Only add `goal.id` when `resolve_contribution_goal` returns non-None.

This immediately gives: completed goals stop gaining evidence for post-`completed_at` activity (reusing `goal_was_completed_before`), and currently-paused goals gain none (`goal_suppresses_contribution`). Reuses `services/goal_contribution.py` — no new logic.

### Part B — Durable pause windows (so pause-time evidence never counts, even after resume)

`goal_was_completed_before` uses a permanent timestamp (`completed_at`). Pause needs the same durability, but pauses repeat, so store intervals.

**New model + migration: pause intervals**
- New table `goal_pause_intervals` (mirror conventions of existing junction/history tables in `models/`): `id`, `goal_id` (FK `goals.id`, `ondelete='CASCADE'`, indexed), `paused_at` (DateTime), `resumed_at` (DateTime, nullable — null = still paused), `root_id` (indexed, matching existing root-scoping convention), `created_at`. Add to `models/goal.py` and export via `models/__init__.py`.
- Alembic migration creating the table. **Note:** the repo currently has multiple Alembic heads (`b8e4a72f9d31`, `c4d5e6f7a8b9`, `ab12cd34ef56`). Resolve by chaining off the appropriate head or adding a merge revision; confirm intended head with `alembic heads` before writing `down_revision`.
- **Backfill:** for goals currently `frozen=True` with a `frozen_at`, insert one open interval (`paused_at=frozen_at`, `resumed_at=NULL`). Past (already-resumed) pauses are unrecoverable and are accepted as not backfilled.

**Write path:** `services/goal_workflow_service.py` — `toggle_pause` (lines ~108-123)
- On pause (`paused=True`): set `paused`/`paused_at` (renamed from `frozen`, see Part C) and insert a new open `goal_pause_intervals` row.
- On resume (`paused=False`): clear the flag and close the latest open interval (`resumed_at=now`).

**Read rule:** extend `services/goal_contribution.py`
- Add `goal_was_paused_at(goal, timestamp)` that returns True if `timestamp` falls within any of the goal's pause intervals (open interval = `paused_at <= ts`).
- In `resolve_contribution_goal`, add this check alongside `goal_suppresses_contribution` and `goal_was_completed_before`. Because `resolve_contribution_goal` is the single chokepoint used by Part A, `goal_tree_service.py:64`, and `get_flowtree_session_metrics`, all evidence/metrics paths inherit the rule for free.
- Provide the pause intervals to the resolver efficiently: batch-load intervals per goal (keyed in `goals_by_id` or a sibling map) so this stays free of N+1 round trips, consistent with the batching discipline noted in `index.md`.

### Part C — Rename `frozen` → `paused` across the codebase

The API/UX/frontend already prefer `paused`; finish the rename and remove the legacy term.

**Backend (~27 occurrences, 8 files):**
- `models/goal.py:138-139`: rename columns `frozen` → `paused`, `frozen_at` → `paused_at` (Alembic migration to rename columns; fold into the Part B migration or a sibling revision).
- `services/serializers.py:342-345, 369-374`: drop the duplicated `frozen`/`frozen_at` output keys; keep only `paused`/`paused_at`.
- `services/goal_contribution.py:10-11`: `goal_suppresses_contribution` reads `goal.paused`.
- `services/goal_workflow_service.py`, `services/goal_target_service.py:338`, `services/goal_service.py:1095`, `services/admin_service.py:783-812`: update field access and serialized keys.
- `blueprints/goals_api.py`: remove the legacy `/freeze` endpoint (lines ~647-669) and its validator, or keep a thin redirect to `/pause` only if external callers exist (none found in-repo → prefer removal).

**Frontend (~22 occurrences, 11 files):**
- `client/src/utils/goalNodeModel.js:119-122`: collapse the `paused ?? frozen` fallbacks to `paused`/`paused_at` only (safe once the API stops emitting `frozen` and Part C backend lands).
- `client/src/utils/api/fractalGoalsApi.js:53-54`: remove `freezeGoal`.
- `client/src/hooks/useGoalOptionsMutations.js:78`: remove `freezeGoal` alias.
- `client/src/components/goals/GoalHeader.jsx:25-49`: drop the `'frozen'` status branch (now only `'paused'`).
- Remaining `frozen` references in `GoalDetailModal.jsx`, `GoalOptionsView.jsx`, `flowTreeGraphUtils.js`, `useSessionGoalsViewModel.js`, `useFlowTreeMetrics.js` and the two test files: rename to `paused`.

> Sequencing: land Part C backend (DB column rename + serializer) and frontend together, or run column rename first with serializers emitting both keys during the deploy window, then remove `frozen` keys. Given this is a private-beta single-instance deploy, a single coordinated change is acceptable.

---

## Critical files

- `services/session_analytics_service.py` — Part A core fix; consistency with metrics path.
- `services/goal_contribution.py` — single contribution chokepoint; add pause-window rule.
- `services/goal_workflow_service.py` — pause/resume now writes interval history.
- `models/goal.py` + `models/__init__.py` — new `goal_pause_intervals`; column rename.
- `migrations/versions/` — new table + backfill + column rename (resolve multi-head first).
- `services/serializers.py`, `services/admin_service.py`, `services/goal_service.py`, `services/goal_target_service.py`, `blueprints/goals_api.py` — rename + drop legacy keys/endpoint.
- Frontend: `goalNodeModel.js`, `GoalHeader.jsx`, `fractalGoalsApi.js`, `useGoalOptionsMutations.js`, and the remaining `frozen` files above.

## Reuse (do not reinvent)

- `services/goal_contribution.py:resolve_contribution_goal` / `goal_was_completed_before` / `goal_suppresses_contribution` — already the correct rules; Part A just applies them, Part B extends them.
- `get_flowtree_session_metrics` (lines ~385-465) is the reference implementation for the timestamp-aware, batched evidence pattern to mirror in `get_recent_evidence_goal_ids`.
- `goalNodeModel.js` already normalizes `paused`-first; the rename only removes the now-dead `frozen` fallback.

---

## Verification

1. **Unit (backend):** add tests in `tests/` for `goal_contribution`:
   - activity after `completed_at` → excluded; before → included.
   - activity within an open/closed pause interval → excluded; outside → included.
2. **Service test:** `get_recent_evidence_goal_ids` for a multi-goal activity where one linked goal is completed before the activity and one is active → only the active goal appears. A goal completed *after* the activity (pre-completion evidence) still appears until aged out.
3. **Migration test:** apply migration on a DB with a `frozen=True` goal → backfilled open `goal_pause_intervals` row; column rename preserves data.
4. **Frontend tests:** update `useFlowTreeMetrics.test.js` and `useSessionGoalsViewModel.scope.test.js`; assert completed/paused goals resolve to `inactive`/`paused` and no `frozen` keys remain.
5. **End-to-end manual (`./run-tests.sh` then app):**
   - Complete a goal, perform an activity linked to it + another active goal → completed goal does **not** re-activate; other goal does.
   - Wait/age (or set `active_goal_window_days` low) → completed goal flips inactive naturally.
   - Pause a goal, log a linked activity → no evidence; resume → that activity still does not count.
6. **Full suite:** `./run-tests.sh` (frontend + backend) green; grep the repo for residual `frozen` → only the historical migration `d4d467d80f3c_add_frozen_fields_to_goals.py` (immutable history) may remain.
