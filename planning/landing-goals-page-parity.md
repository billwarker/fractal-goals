# Landing Explorer → Full Goals-Page Parity

## Context

The `/landing` example explorer already renders the real `FlowTree` + read-only `GoalDetailModal` from a published snapshot (prior change). But next to the authenticated goals page (`FractalGoals.jsx`) it still feels like a stripped demo, not the real thing. The user wants exact parity:

1. **Same fade in/out animations** when the FlowTree view changes (scope/view-mode transitions).
2. **Goal detail modal slides in from the side** with the same animation as the real docked panel.
3. **The Tree/Hierarchy view widget (`FlowTreeOptionsPane`) exists in full form** — tree↔hierarchy toggle + Fade inactive / Hide inactive / Hide completed / Show metrics overlay.
4. **The full data scope the real page consumes** is embedded for the example fractals.

The fade animations and scope-transition machinery already live **inside** `FlowTree` (`isVisible` opacity + `startFadeOut()` + `scopeTransitionKey`); the real page drives them through `FractalGoals.jsx`. The gap is that `Landing.jsx` doesn't replicate that wiring, doesn't render the options pane, doesn't use the real docked slide-in container, and the snapshot lacks the evidence/metrics/programs data those controls depend on.

Two product decisions confirmed:
- **Metrics overlay = whole-fractal snapshot**: embed one precomputed full-tree `metrics_summary`; the overlay shows whole-fractal numbers and is not scope-reactive (the only intentional deviation from the live page, since there's no public API to recompute per scope).
- **Embed evidence + metrics + programs** so Fade/Hide-inactive, Hide-completed, the overlay, and program-alignment all behave like the real page.

## Database / Snapshot Grade (current): **A-**

The snapshot is already a clean, versioned (`schema_version: 2`), self-contained read model with goals, targets, activities, timeline, and notes. Relative to *this* parity goal:

- ✅ Per-goal goal/target/activity/timeline/notes embedding already landed; publish is a rare manual admin action so extra per-root queries are fine.
- ✅ Backend already has `SessionService.get_recent_evidence_goal_ids`, `get_flowtree_session_metrics`, and `serialize_program` — the exact data the real page fetches via `useFlowTreeEvidence` / `useFlowtreeSessionMetrics` / `usePrograms`.
- ⚠️ The snapshot embeds none of evidence / metrics / programs, so the four view-widget controls have nothing to act on (inactive/completed scoping and the overlay are inert).
- ⚠️ `schema_version` stays `2`; adding root-level fields warrants a bump to `3` for forward-safe detection.

## Target Grade: **S+**

- The published example becomes a complete frozen mirror of one authenticated fractal view: goals + targets + activities + timeline + notes (already there) **plus** `evidence_goal_ids`, a whole-tree `metrics_summary`, and serialized `programs`.
- The landing page reuses the real `FlowTree`, `FlowTreeOptionsPane`, scope-transition + fade-out wiring, and the real docked slide-in container — so behavior is identical by construction, not re-implemented.

---

## Implementation Plan

### Step 1 — Embed evidence + metrics + programs into the snapshot (backend)
`services/admin_service.py` (`publish_landing_examples`, example payload), reusing existing services.

- For each published root, after building + history-enriching the tree, also compute (passing the admin `root.owner_id` to satisfy owned-root checks):
  - `evidence_goal_ids`: `SessionService(self.db_session).get_recent_evidence_goal_ids(root.id, owner_id)` → store the `goal_ids` list.
  - `metrics_summary`: collect all goal ids in the serialized tree and call `get_flowtree_session_metrics(root.id, owner_id, goal_ids=<all tree goal ids>)` → store the summary dict (whole-fractal).
  - `programs`: serialize the root's programs with the existing `serialize_program` (`services/serializers.py:789`) — only the fields the flowtree metrics consume (`goal_ids`, `blocks`).
- Attach these at the **example** level (root-scoped), not per goal: `example["evidence_goal_ids"]`, `example["metrics_summary"]`, `example["programs"]`.
- Bump `LANDING_EXAMPLE_SCHEMA_VERSION` to `3`; keep it in cache + each example.
- `services/public_service.py` already passes examples through verbatim — no change beyond the version it echoes.
- Update `tests/integration/test_admin_api.py` to assert the new root-level fields exist and `schema_version == 3`.

### Step 2 — Render the full `FlowTreeOptionsPane` widget on landing
`client/src/pages/Landing.jsx` + `Landing.module.css`.

- Add `viewSettings` state (default all-off, like `DEFAULT_VIEW_SETTINGS`) and `goalsViewMode` state (`'tree'` desktop / `'hierarchy'` mobile, via `getIsMobileViewport()`), plus `isOptionsPaneMinimized`.
- Render `FlowTreeOptionsPane` (`components/flowTree/FlowTreeOptionsPane.jsx`) inside the tree canvas with the same props the real page passes (`goalsViewMode`, `onGoalsViewModeChange`, `viewSettings`, `onToggleViewSetting`, tooltips). Reuse the existing `flowtree-options-pane` CSS — it's global (`FractalGoals.css`/`App.css`), so it already themes correctly; just ensure `FractalGoals.css` (or the needed pane styles) is imported on the landing route.
- The widget's four checkboxes + tree/hierarchy toggle then feed the real `FlowTree`.

### Step 3 — Replicate the fade-out + scope-transition wiring
`client/src/pages/Landing.jsx`.

- Hold a `flowTreeRef` and pass it to `<FlowTree ref=…>` (FlowTree already exposes `startFadeOut` via `useImperativeHandle`).
- Port `handleToggleViewSetting` from `FractalGoals.jsx:420-444` verbatim: for `hideInactiveGoals`/`hideCompletedGoals`, call `flowTreeRef.current.startFadeOut()`, then after `FLOWTREE_SCOPE_TRANSITION_MS` (160ms) apply the setting and bump `flowTreeScopeKey`; other settings apply immediately.
- Keep the goal-click scope bump already in place; the existing `scopeTransitionKey` prop now also covers view-setting transitions.
- Add `key={`${selectedExample.id}-${goalsViewMode}`}` to `<FlowTree>` so switching tree↔hierarchy remounts with the same fade-in the real page gets, and pass `layoutMode={goalsViewMode}`, `evidenceGoalIds`, `metricsSummary`, `programs`, `activities`/`activityGroups` (from the snapshot) so the controls act on real data.
  - Build `evidenceGoalIds` as a `Set` from `selectedExample.evidenceGoalIds`; pass `metricsSummary={selectedExample.metricsSummary}` and `programs={selectedExample.programs}`.

### Step 4 — Use the real docked side-in panel + animation
`client/src/pages/Landing.jsx` + `Landing.module.css`.

- Replace the bespoke `.goalDetailDock` container with the real docked structure/classes from `FractalGoals.jsx:522-560`: a `details-window sidebar docked` wrapper (which carries the `slideInRight 0.3s ease` animation from `App.css:1225`) holding the `displayMode="panel"` modal, and drive the FlowTree's left-shift via `sidebarOpen`.
- Ensure the `slideInRight` keyframe + `.details-window.sidebar.docked` styles are available on the landing route (they live in `App.css`, already imported app-wide; verify on the public route and import if missing). Keep the surface fully opaque (already done).
- Mobile keeps `displayMode="modal"` full-screen (unchanged).

### Step 5 — Thread the new snapshot data through `publishedExamples`
`client/src/pages/Landing.jsx` (`publishedExamples` memo).

- Extend the per-example mapping to carry `evidenceGoalIds` (from `example.evidence_goal_ids`), `metricsSummary` (from `example.metrics_summary`), and `programs` (from `example.programs`), alongside the existing `tree`/`features`/`rootIcon`.

### Step 6 — Tests
- `client/src/pages/__tests__/Landing.test.jsx`: extend the mocked snapshot with `evidence_goal_ids`/`metrics_summary`/`programs`; assert (a) the `FlowTreeOptionsPane` renders (tree/hierarchy toggle + the four checkboxes), (b) toggling tree↔hierarchy updates `data-layout-mode` on the mocked FlowTree, (c) `evidenceGoalIds`/`metricsSummary`/`programs` reach FlowTree (surface them as data-attrs in the mock), (d) the detail panel uses the docked container.
- `tests/integration/test_admin_api.py`: assert `evidence_goal_ids` (list), `metrics_summary` (dict), `programs` (list), and `schema_version == 3` in the published cache + public response.
- Run `./run-tests.sh frontend` and `./run-tests.sh file tests/integration/test_admin_api.py`.

---

## Critical files

- `services/admin_service.py` — embed evidence/metrics/programs + bump schema version in `publish_landing_examples`.
- `client/src/pages/Landing.jsx` — options pane, view-mode + viewSettings state, fade-out/scope-transition wiring, docked side-in panel, snapshot data threading.
- `client/src/pages/Landing.module.css` — adopt/borrow the docked panel + ensure options-pane styling on the route.
- Reused as-is: `components/flowTree/FlowTreeOptionsPane.jsx`, `FlowTree.jsx` (`startFadeOut`, `scopeTransitionKey`, `layoutMode`, fade `isVisible`), `getIsMobileViewport` (`hooks/useIsMobile.js`), `DEFAULT_VIEW_SETTINGS`/`FLOWTREE_SCOPE_TRANSITION_MS` pattern (`FractalGoals.jsx`), `App.css` `slideInRight` + `.details-window.sidebar.docked`, `SessionService.get_recent_evidence_goal_ids` / `get_flowtree_session_metrics`, `serialize_program` (`services/serializers.py:789`).

## Verification

1. `./run-tests.sh frontend` and the targeted backend integration test pass.
2. Manually (run/verify skill): in Admin → `landing` tab, publish an admin fractal that has sessions/activities/programs, then open `/landing`:
   - The Tree View widget shows the tree/hierarchy toggle + all four checkboxes; toggling tree↔hierarchy fades out/in exactly like the goals page.
   - Checking Hide inactive / Hide completed fades the tree out and re-centers on the scoped set (160ms transition), matching the real page.
   - Show metrics overlay displays whole-fractal numbers (static across scope changes).
   - Clicking a goal slides the detail panel in from the right with the `slideInRight` animation; the FlowTree shifts left; closing slides it away and restores the full tree.
3. DevTools network tab on `/landing`: still only the single `/api/public/landing-examples` request — no authenticated evidence/metrics/programs calls.

---

## Follow-up fixes (post-review)

1. **Tree didn't recenter into the compressed viewport when the side pane opened.** The dock was `position: absolute` over the canvas, so the FlowTree container never shrank and `fitView` centered across the full width. Fix: canvas is now a flex row — `.flowTreeViewport` (`flex:1; min-width:0`) holds the options pane + FlowTree, and the dock is an in-flow flex sibling. The viewport physically compresses and the FlowTree re-fits, like the real goals page. (`Landing.jsx`, `Landing.module.css`.)

2. **Modal goal-level colors + 3. invisible SMART letters.** Shared cause: `GoalLevelsContext` is auth-gated and empty on the public page. Fix: optional `seedLevels` prop on `GoalLevelsProvider` that bypasses the query; `/landing` collects distinct levels from the snapshot tree (`collectSnapshotLevels`) and wraps the read-only modals in `<GoalLevelsProvider seedLevels={…}>`. Tree node colors already worked (read from each node's embedded `level`). Test: `GoalLevelsContext.seed.test.jsx`.

4. **SMART icon styling (concentric rings) missing on landing icons.** Cause: the snapshot serializer used a hand-rolled `smart_status` (measurable = targets only, achievable = hardcoded True) that diverged from the app's real logic, so `is_smart` was wrong and the FlowTree node / toggle icons rendered as plain shapes. Fix: `_serialize_public_goal_tree` now calls the canonical `calculate_smart_status` (`services/serializers.py`), matching the authenticated app. **Requires re-publishing** the landing examples to refresh the cached `is_smart`. Test: extended `tests/integration/test_admin_api.py` to make the child genuinely SMART and assert `is_smart`/`smart_status`.
