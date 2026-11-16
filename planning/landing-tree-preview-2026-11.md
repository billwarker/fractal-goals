# Landing: working icons and a read-only goal tree beside the demo picker

On approval, save as `planning/landing-tree-preview-2026-11.md`.

## Context

You asked for three changes to the landing page:

1. Goal level colours and icons aren't showing properly.
2. On desktop, a two-column layout: the existing content on the left, and the demo example's goal flow tree on the right.
3. The tree is a preview only. Visitors can't pan, zoom or click into it. To explore, they open the demo.

**Why the icons are wrong.** Production's public demo file (`gs://fractal-goals-landing-public-…/landing-examples.json`) is the old one, published 15 Jul 2026 with schema 12. It has no `icon` field, so `demoIconProps` (`client/src/demo/demoExamples.js`) falls back to the blue twelve-point star for every example. Two things caused this:

- The snapshot publishing code isn't live in production. The deploy gate was blocking it until today.
- **Publish demos** hasn't been pressed there since.

The client also accepted that stale file without complaint, because `isLandingSnapshot` (`client/src/utils/landingPrefetch.js`) allows any schema version from 12 up. The current schema is 14 (`services/_landing_common.py`).

**Why there's no tree data.** The snapshot redesign removed the tree from the public file. The old tree was about 1 MB per example: 51 goals × the full API serializer, with notes, targets and timelines. The flow tree needs only a few fields per goal.

## Current grade, for this goal (F → S)

| Area | Grade | Why |
|---|---|---|
| Icon correctness | **D** | Production shows the fallback star for every example. The client accepts a pre-snapshot file without complaint, so the same thing can happen again. |
| Desktop layout | **C** | One centred column on a 1440px screen; most of the width is empty grid. |
| Showing the product | **D** | Two identical stars don't show what Fractal Goals is. The tree is the product's signature view, and the landing doesn't show it. |
| Public data contract | **B** | The v2 manifest is small and safe, but holds nothing to draw a preview from. |
| **Overall** | **C−** | |

## What S+ looks like

- **One source for colours and icons.** The manifest carries the snapshot's effective goal levels. The picker icons and the tree both resolve through `GoalLevelsProvider seedLevels` (`client/src/contexts/GoalLevelsContext.jsx`, which already supports seeding for the landing). An icon can't disagree with the tree.
- **A faithful preview tree at a tiny size.** The tree is serialized with the app's own `serialize_goal`, then cut down to an allowlist of the fields the flow tree reads. A parity test proves the trimmed tree draws exactly the same nodes as the full one. A budget test keeps it small, about 15 KB gzip for 150 goals. No descriptions, notes, targets or timelines go public.
- **The real `FlowTree`, read-only.** It's the same component, layout and styling as the app. A new `readOnly` mode turns off pan, zoom, selection and focus. The whole preview panel is a link: "Open the live demo →".
- **Responsive.** Two columns from 1024px. Below that, the current single column with no tree. The React Flow chunk is lazily loaded on desktop only, so phones don't pay for it and first paint isn't delayed.
- **Stale files are rejected.** The client accepts only the current schema from the static file, and falls back to the API otherwise. After deploying, publishing in dev and prod is part of the rollout, and it's verified against the public file.

---

## Phase A: Manifest preview data (backend)

- **`services/landing_publish_service.py` `_build_published_example`** gains `preview: {levels, tree, evidence_goal_ids}`, built from the snapshot root:
  - **`tree`:** `serialize_goal(root)`, loaded through the same path as `GoalService.get_fractal_tree` (`services/_goal_fractals.py`). A new `_preview_tree(node)` keeps only the allowlisted keys, top-level and `attributes`, and recurses into `children`. The allowlist is one constant, `LANDING_PREVIEW_GOAL_FIELDS`, in `services/_landing_common.py`. It covers: `id, name, type, level_id, level_name, completed, completed_at, paused, deadline, created_at, is_smart, smart_status, level_characteristics, sequence_track_id, sequence_position, parent_id, children`. The exact list is confirmed by the Vitest parity test.
  - **`levels`:** the snapshot's effective levels from `GoalLevelService.list_goal_levels(demo_owner_id, root_id=snapshot_root)`, trimmed to the fields `GoalLevelsContext` reads (id, name, color, secondary_color, icon, rank and characteristics).
  - **`evidence_goal_ids`:** the snapshot's goals that have activity evidence, from the same source the goals page uses, so inactive goals are dimmed the way the demo shows them.
- **`icon`** stays in the manifest for the picker, but `_root_icon` now reads it from the same trimmed `levels`, so the two can't drift.
- `LANDING_EXAMPLE_SCHEMA_VERSION` goes from 14 to 15.

## Phase B: Rejecting stale files (client)

- **`landingPrefetch.js` `isLandingSnapshot`:** accept a static or preloaded file only when `schema_version >= 15`. Otherwise use the API (`publicApi`), which serves the current published cache.
- **`demoExamples.js`:** `demoIconProps` keeps its fallback, but only for a root level that genuinely has no icon.

## Phase C: Read-only `FlowTree`

- **`client/src/FlowTree.jsx`:** add a `readOnly` prop. It implies `interactionLocked` and also sets:
  - `elementsSelectable={false}`, `nodesFocusable={false}`
  - `zoomOnDoubleClick={false}`, `zoomOnPinch={false}`, `panOnScroll={false}`
  - `preventScrolling={false}`, so the wheel scrolls the page instead of being swallowed

  Passing no `onNodeClick`/`onAddChild` already hides the "+ Add" buttons (`AddChildButton` in `FlowTreeNode.jsx`).

## Phase D: Landing layout and preview

- **New `client/src/components/landing/LandingTreePreview.jsx`** (lazy):
  - wraps `FractalView`/`FlowTree` in `<GoalLevelsProvider seedLevels={example.preview.levels}>`;
  - passes `treeData`, `evidenceGoalIds`, default view settings and `readOnly`;
  - the tree container is `inert` and `aria-hidden`;
  - the panel is an `<a href={demoHref(id)}>` labelled "Open the {label} live demo". It has a caption (root name · N goals) and an "Open the live demo →" pill that rises on hover and focus. Clicking warms the demo session, like the picker cards (`warmDemo`).
  - a crossfade when the previewed example changes.
- **`client/src/pages/Landing.jsx`:**
  - `useMediaQuery('(min-width: 1024px)')` decides whether the preview is shown, and the preview is lazily imported only then.
  - The preview shows `previewed ?? examples[0]`. Hovering or focusing a picker card switches it. Leaving keeps the last one (rather than snapping back), and the hero title keeps its current behaviour.
  - The picker icons render inside the same seeded provider, using the example's root level, so icons and tree share colours.
- **`Landing.module.css`:**
  - at ≥1024px, `.hero` becomes a two-column grid (about `minmax(360px, 5fr) 7fr`, gap 48px, max-width 1200px);
  - the left column is left-aligned: kicker, title, body, demo label, picker, hint, waitlist;
  - the right column holds the preview panel: card surface, border and radius tokens, height `min(72vh, 640px)`;
  - below 1024px, nothing changes;
  - while examples load, the placeholder takes the panel's size, so the layout doesn't jump.
- **Theme:** the tree uses the app's tokens and works in light and dark. The example's `appearance` (completed colours) is applied the way `DemoAuthProvider` does it.

## Phase E: Verification

- **Backend** (`tests/integration/test_demo_snapshots.py` / landing publish tests):
  - the manifest has `preview.levels`, `preview.tree` and `evidence_goal_ids` for each example;
  - the tree has every goal in the snapshot;
  - no key outside the allowlist appears at any depth, so no description, notes, targets, timeline or owner;
  - size budget: a 150-goal fractal's preview is under 60 KB raw;
  - `icon` equals the root level's icon, colour and secondary colour in `preview.levels`.
- **Vitest:**
  - **Parity:** `useFlowTreeGraph` on the full API tree fixture vs the trimmed tree gives identical node ids, positions and data, except for callbacks.
  - `Landing`:
    - at desktop width, the preview renders the first example and switches on hover;
    - at compact width, no preview and no FlowTree import;
    - the preview link's href and accessible name are correct;
    - the tree container is inert.
  - `landingPrefetch` rejects schema 12 and 14 static files and accepts 15.
  - `FlowTree` `readOnly` passes the locked props to React Flow.
- **e2e (`landing.spec.js`):**
  - desktop: the tree's nodes are visible and sit right of the text column;
  - icons and nodes use the level colours from the published levels, not the fallback;
  - a wheel or drag over the tree leaves `.react-flow__viewport`'s transform unchanged;
  - clicking the panel opens `/demo/<id>/goals?tour=1`;
  - mobile: no tree, layout unchanged.
  
  Plus updated landing sweep surfaces, and responsive and contrast audits.
- **Full suites:** backend, Vitest, lint, typecheck, the responsive and maintainability audits, the quick sweep.
- **Rollout:**
  1. Deploy.
  2. Press **Publish demos** in dev and in prod.
  3. Fetch the public file. It should be schema 15, with icons and previews for both examples.
- **Docs:** update the Landing paragraph in `index.md` (the preview contract and the allowlist), and write a delivery log.

## Critical files

- **Backend:** `services/landing_publish_service.py`, `services/_landing_common.py`, `tests/integration/test_demo_snapshots.py` (or the landing publish tests)
- **Client:**
  - `client/src/pages/Landing.jsx` and `Landing.module.css`
  - new `client/src/components/landing/LandingTreePreview.jsx` (+ `.module.css`)
  - `client/src/FlowTree.jsx`, `client/src/utils/landingPrefetch.js`, `client/src/demo/demoExamples.js`
  - `client/e2e/landing.spec.js`

## Reuse

- `GoalLevelsProvider seedLevels`, built for the landing
- `FractalView` / `FlowTree` / `useFlowTreeGraph`, unchanged except for `readOnly`
- `serialize_goal` plus the `get_fractal_tree` loading path
- `GoalLevelService.list_goal_levels`
- `demoHref`, `warmDemo`, `useMediaQuery`, and the existing `previewRootId` hover state

## Assumptions (edit inline if wrong)

- The preview shows the whole tree, fitted to the panel with the default view settings: completed goals shown, inactive ones dimmed.
- Below 1024px there's no tree. Phones keep the current one-screen hero.
- Hovering a picker card switches the preview. Clicking a card still opens that demo, as now.

## Delivery log (2026-11-13)

- **A. Manifest:** schema 15. Each example carries `preview: {levels, tree}`. The tree is `serialize_goal` on the snapshot, cut to the allowlists in `services/_landing_common.py`, and the root icon is read from those same levels. `evidence_goal_ids` was dropped from the plan: evidence only changes the tree with the "fade/hide inactive" settings, which the preview doesn't use. For the showcase, the preview is well under the 60 KB budget.
- **B. Stale files:** `landingPrefetch.js` takes a static or preloaded manifest only at `LANDING_SCHEMA_VERSION` (15) with a revision; anything older goes to the API.
- **C. Read-only `FlowTree`:** `readOnly` locks pan, zoom, pinch and double-click, and turns off selection and focus. It also stops React Flow swallowing the wheel. A node without `onNodeClick` gets no click handler.
- **D. Landing:** two columns from 1024px, with `LandingTreePreview` lazily loaded. The tree stays on the last example pointed at. Picker icons resolve through the seeded levels (`LandingExampleIcon`), not the manifest's `icon`. The e2e fixture's root level has no stored colour or icon, which showed the picker's fallback (a blue star) disagreeing with the app's fallback (a green circle); resolving both the same way fixed it. `GoalLevelsProvider` takes `seedAppearance` for completed-goal colours.
- **E. Verification:**
  - backend: snapshot tests, including the allowlist, parity with the demo's own `/goals` and `/goal-levels`, and the size budget;
  - Vitest: 2,690 passing;
  - lint, typecheck, and the responsive, maintainability and contrast audits;
  - e2e `landing`, `demo` and `admin-live-demo` on desktop and mobile.
- **Rollout (still to do):**
  1. Deploy.
  2. Press **Publish demos** in dev and prod.
  3. Check that the public file is schema 15 with previews.
- **Follow-ups the same day:**
  - The tree column appears only once a published preview is in hand. Reserving it while loading made the page jump back to one column when the manifest was stale.
  - The tree now fills the right of the window, from the header to the footer and out to the edge, drawn straight on the page with no panel.
  - On desktop the header, footer and copy use the full width, so the left edge sits on the page margin instead of a centred 1200px column.
  - The hero fits one screen from 1024×700 up; picker icons shrink to 64px on screens 820px tall or less.
  - The tree is interactive after all, at the user's request: pan and zoom, a goal click opens the demo on that goal, and the button starts the tour. `FlowTree`'s `readOnly` mode was removed again.
  - The tree's frame snaps to the background's 20px grid, with a 48px gap on the right; a faint outline on those lines shows on hover.
  - In the left column, the label, headline, copy and picker are centred.
  - The caption (goal name and count) and the "Open the live demo" button under the tree were removed; the frame now runs down to 20px above the footer. Clicking a goal or a picker icon still opens the demo.
