# Landing Page — Full Read-Only Goal Explorer Parity

## Context

The landing page (`client/src/pages/Landing.jsx`) leads with a public, unauthenticated example goal explorer built from a hand-curated, admin-published snapshot (`app_settings.landing_example_cache`, served by `/api/public/landing-examples`). The current diff wired up the snapshot, a read-only flag through `ConnectedGoalDetailModal`, and basic icon plumbing — but four gaps remain against the intended "feels like the real app, just frozen" experience:

1. **Icons don't match / lack SMART styling where it exists.** The feature carousel (`FeatureVisual` in `Landing.jsx`) renders icons from a hardcoded `levelByType` map with a fake `isSmart={index === 0}`, so they neither match the example's real goals nor reflect real SMART status.
2. **Clicking a goal does nothing to the tree.** `handleGoalSelect` only sets `selectedGoalId`; the `FlowTree` is not told to filter to that goal's lineage or re-center, even though the renderer already supports both.
3. **The detail modal is gutted in read-only mode.** It currently exposes only a "Details" tab. The user wants the full surface — Activities, Timeline, Notes — visible (read-only) for landing visitors.
4. **The modal is transparent and doesn't behave like the real modal.** The dock uses `color-mix(... 94%, transparent)` and a bespoke layout instead of the real `GoalDetailModal` chrome.

Two product decisions confirmed with the user:
- **Embed everything**: extend the published snapshot + public serializer to carry associated activities, the goal timeline, and notes per goal, and render every tab from that snapshot (no API calls on the public page).
- **Hide + stop-sign hover**: remove all edit/action affordances and show a `not-allowed` stop-sign cursor + tooltip on any normally-interactive control.

> Privacy note: the published examples are admin-owned, hand-picked fractals meant for public display, and publishing is an explicit manual admin action. Embedding their timeline/notes into the public cache exposes that curated history publicly — acceptable for example fractals, but the publish flow should make this visible (see Step 5).

## Database Grade (current): **B-**

The data model is sound, but the *publish snapshot* is the weak link relative to this plan:

- ✅ Clean `app_settings` split between draft (`landing_example_settings`) and published cache (`landing_example_cache`); public endpoint serves only the cache, no auth, no live DB walk.
- ✅ `load_fractal_goals_for_serialization` already eager-loads `targets_rel`, `associated_activities`, `associated_activity_groups`, and `sessions` in one pass — no N+1 to add activities.
- ✅ Effective goal-level resolution (owner/root overrides) already handled by `_load_effective_landing_levels`.
- ⚠️ `_serialize_public_goal_tree` hardcodes `associated_activity_ids: []` and omits activities, timeline, and notes entirely — so "embed everything" is currently impossible from the cache.
- ⚠️ No timeline or notes data is loaded by `load_fractal_goals_for_serialization`; timeline comes from `GoalTimelineService` and notes from the note service, neither wired into the publish path.
- ⚠️ Snapshot has no `schema_version`, so future shape changes can't be detected/migrated safely.

## Target Grade: **S+**

- Snapshot becomes a self-contained, versioned, denormalized read model: each goal node carries its targets, associated activity definitions, a bounded timeline, and bounded notes — everything the modal tabs need, with zero public API surface beyond the existing cache endpoint.
- Frontend renders all tabs purely from snapshot data; read-only is enforced structurally (no mutating hooks fire) *and* affordance-wise (stop-sign hover).
- The example explorer reuses the real `FlowTree` lineage-scoping + centering it already supports, so the public tree behaves identically to the authenticated goals page.

---

## Implementation Plan

### Step 1 — Tree lineage filtering + centering on goal click (frontend only)
`client/src/pages/Landing.jsx`

The renderer already prunes to a goal's lineage when `selectedNodeId` is set (`convertTreeToFlow` → `getLineagePath` in `flowTreeGraphUtils.js`) and re-centers via `zoomTargetNodeId` + a smooth scope transition via `scopeTransitionKey` (see `FractalGoals.jsx:93–116, 511–514`). Landing passes none of these.

- Track a `flowTreeScopeKey` counter (`useState`) and bump it in `handleGoalSelect`, mirroring `flowTreeScopeTransitionKey` on the goals page.
- Pass to `<FlowTree>`: `selectedNodeId={selectedGoalId}`, `zoomTargetNodeId={selectedGoalId}`, `scopeTransitionKey={flowTreeScopeKey}`.
- On example switch / modal close (`handleExampleSelect`, `onClose`) clear `selectedGoalId` (already done) so the tree expands back to the full example.
- Keep `sidebarOpen={Boolean(selectedGoal)}` so centering accounts for the dock inset (already wired in `getHierarchyViewport`).

### Step 2 — Make feature-carousel icons match + carry real SMART styling
`client/src/pages/Landing.jsx` (`FeatureVisual`, `buildExampleFeatures`)

- Replace the synthetic `iconSet`/`levelByType` + `isSmart={index === 0}` logic. Build each visual row from the real flattened goal nodes of the selected example (`flattenGoalTree(example.tree)`), and derive icon props per goal via the existing `getGoalIconProps(goal)` helper already defined in `Landing.jsx` (reads `level.icon/color/secondary_color` and real `is_smart`).
- `buildExampleFeatures` should carry the actual goal node (or its resolved icon props + name) into each row instead of just a name string, so the icon reflects that goal's true level + SMART state.
- Keep the deterministic per-feature selection (e.g. top-down lineage slice) but stop faking SMART on the first row. Fall back to `fallbackVisualRows` + neutral level icons only when an example has fewer than 4 goals.

### Step 3 — Backend: embed activities, timeline, and notes into the published snapshot
`services/admin_service.py` (`_serialize_public_goal_tree`, `publish_landing_examples`), reusing existing serializers.

- **Activities**: replace `associated_activity_ids: []` with real data. For each goal, serialize `goal.associated_activities` (already eager-loaded) using the existing `serialize_activity_definition` (`services/serializers.py:714`) — trimmed to the fields the read-only Activities view needs (name, level icon/color, `metric_definitions`). Also populate `associated_activity_ids` and `associated_activity_group_ids` so SMART "measurable/relevant" and the view render correctly.
- **Timeline**: in `publish_landing_examples`, after loading the root, call `GoalTimelineService.get_goal_timeline(...)` per goal (or once per root with `include_children`) and embed a **bounded** list (e.g. `limit=50`, default types) as `attributes.timeline_events` on each node. Reuse the service's existing serialization so payload shape matches what `GoalTimelineView` already expects.
- **Notes**: load each goal's notes via the existing note service (goal-context notes, optionally descendants) and embed a **bounded** list as `attributes.notes`, shaped to what `NoteTimeline` consumes.
- Add `"schema_version": 2` to the cache payload and to each example for forward-safe shape evolution.
- Keep everything inside the single `load_fractal_goals_for_serialization` pass where possible; timeline/notes are additional bounded queries per published root (publish is a rare manual admin action, so cost is fine).
- Update `tests/integration/test_admin_api.py` publish assertions to cover the new embedded fields.

### Step 4 — Frontend: render all tabs read-only from the snapshot (no API calls)
`client/src/components/GoalDetailModal.jsx`, `ConnectedGoalDetailModal.jsx`, and the three tab views.

- **Restore tabs in read-only.** In `GoalDetailModal.jsx`, the `ViewToggleTabs` `items` currently collapse to just `Details` when `readOnly`. Show the full set (`Details`, `Timeline`, `Activities`, `Notes`) in read-only too.
- **Feed tab views from props, not authenticated hooks.** Today `queryRootId`/`queryGoalId` are nulled in read-only so `useGoalAssociations`, `useGoalMetrics`, `useGoalNotes`, `useGoalTimeline` no-op. Add an optional read-only data path:
  - Pass the snapshot's per-goal `associated_activities`, `timeline_events`, and `notes` down from `Landing.jsx` (read off `selectedGoal.attributes`) into `ConnectedGoalDetailModal` → `GoalDetailModal`.
  - `GoalViewMode` already renders targets read-only and accepts `associatedActivities`/`activityDefinitions` — supply them from the snapshot so the Activities surface and SMART status render.
  - `GoalTimelineView` and `GoalNotesView` currently call `useGoalTimeline`/`useGoalNotes` internally. Add a small prop seam: when a `readOnlyEntries` / `readOnlyNotes` prop is provided, render those directly and skip the hook (guard the hook with `enabled: false`). This keeps the authenticated path untouched.
  - `ActivityAssociator`/target/notes *composer* paths stay gated behind `!readOnly` (already true for footers; extend to any inline write controls).
- Keep `useGoalDetailModalData({ enabled: !readOnly })` (already in the diff) so no activity fetches fire publicly.

### Step 5 — Modal solidity + "behave exactly like the real modal" + stop-sign hover
`client/src/pages/Landing.module.css`, `client/src/components/GoalDetailModal.module.css` (or a scoped read-only class), `Landing.jsx`.

- **Solid surface.** Change `.goalDetailDock` background from `color-mix(... 94%, transparent)` to a fully opaque surface token (`var(--color-bg-sidebar)` / `--color-bg-surface`). Ensure the dock renders the modal in `displayMode="panel"` with the same internal chrome the real side panel uses (it already does), so layout matches the authenticated goals side pane.
- **Mobile parity.** Keep `displayMode="modal"` on mobile (already wired) — that path already uses the real `ModalBackdrop` + `modalContent`, which is opaque; verify no landing-specific transparency overrides leak in.
- **Stop-sign hover.** Add a `readOnly` styling hook: when the modal is read-only, apply a class that sets `cursor: not-allowed` and a `title="Sign in to edit"` (or `aria`-friendly tooltip) on elements that would normally be interactive but are now inert (e.g. target rows, activity rows, any residual buttons). Remove (not just disable) the footer action cluster in read-only — `showDetailFooter`/`showEditFooter`/`showActivitiesFooter` are already `!readOnly`-gated, so this is mostly the inline controls inside the tab views.
- Verify the `FlowTree.css` `background: transparent` override (already in diff) plays well against the now-opaque dock so the canvas behind stays the landing background, not a transparent hole.

### Step 6 — Tests
- `client/src/pages/__tests__/Landing.test.jsx`: extend the existing mocked snapshot to include `attributes.associated_activities/timeline_events/notes`; assert (a) clicking a node scopes/centers (mock `FlowTree` already exposes `onNodeClick` + can assert `selectedNodeId`/`scopeTransitionKey` props), (b) read-only modal shows all four tabs, (c) edit affordances are absent / carry the stop-sign class.
- `tests/integration/test_admin_api.py`: assert published cache embeds activities/timeline/notes and `schema_version`.
- Run `./run-tests.sh frontend` and `./run-tests.sh file tests/integration/test_admin_api.py`.

---

## Critical files

- `client/src/pages/Landing.jsx` — tree scoping/centering, real-icon carousel, threading snapshot tab data into the modal.
- `client/src/components/GoalDetailModal.jsx` — restore tabs in read-only, accept snapshot-fed tab data.
- `client/src/components/goalDetail/GoalTimelineView.jsx`, `GoalNotesView.jsx` — optional read-only data props that bypass authenticated hooks.
- `client/src/components/goals/GoalViewMode.jsx` — already read-only aware; feed snapshot activities/targets.
- `services/admin_service.py` — `_serialize_public_goal_tree` + `publish_landing_examples` embed activities/timeline/notes + `schema_version`.
- `client/src/pages/Landing.module.css` / `GoalDetailModal.module.css` — opaque dock + stop-sign read-only styling.
- Reused helpers: `getGoalIconProps` (`Landing.jsx`), `flattenGoalTree`/`findGoalNodeById`/`getGoalNodeId` (`goalNodeModel.js`), `getLineagePath` (`flowTreeTreeUtils.js`), `serialize_activity_definition` + `serialize_timeline_*` (`services/serializers.py`, `goal_timeline_service.py`), `load_fractal_goals_for_serialization` (`services/goal_loading.py`).

## Verification

1. `./run-tests.sh frontend` and the targeted backend integration test pass.
2. Manually (or via the run/verify skill): start backend+frontend, in Admin → `landing` tab select an admin fractal that has real activities/timeline/notes, publish, then open `/landing`:
   - Clicking a goal filters the tree to its lineage and re-centers smoothly; switching examples or closing the modal restores the full tree.
   - Carousel icons match the example's real goal levels and show concentric SMART rings only on genuinely SMART goals.
   - The detail panel is fully opaque and shows Details / Timeline / Activities / Notes with real data, no editing controls, and a stop-sign cursor + tooltip on hover over inert controls.
   - Mobile: the modal opens full-screen, opaque, with the same tabs.
3. Confirm no network calls to authenticated goal/activity/note/timeline endpoints fire from `/landing` (DevTools network tab) — all tab data comes from the single `/api/public/landing-examples` response.
