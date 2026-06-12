# Landing Page Revamp: Curated Feature Showcase + Fast-Loading Examples

## Context

The public landing page (`client/src/pages/Landing.jsx`) already mirrors the real app via admin-published fractal snapshots, but it has four problems the user wants fixed:

1. Examples fetch only after React mounts the page, so the goals view/showcase pop in late with no real loading state.
2. The "See it across the app" feature tabs are visually fused to the viewfinder frame and have **no explanatory text** per feature.
3. The features shown (sessions, programs, analytics) are **auto-derived** (most-recent-4 sessions, ALL programs, two fixed charts) — the admin can't curate what visitors see.
4. Responsive behavior needs a real desktop two-column treatment and tighter mobile optimization.

Target page order (mostly already correct in code): Hero → Example selection → Goals view → Who is the app for → **Features (redesigned)** → Beta CTA.

Decisions made with the user:
- **Programs feature** = admin picks a program **plus a clipped date range**; only blocks/days inside the window render on the landing calendar.
- **Session-templates showcase ("Build" tab) is dropped**; activity preview cards move into the new Activity feature.
- Admin pickers (representative session, ≤4 activities, program + date window, chart selection) are **in scope**.

## Grading the existing implementation (per CLAUDE.md)

**Current grade: B+**
- Strengths: real-app component reuse (FlowTree, SessionCardExpanded, ProgramCalendarView), versioned self-contained snapshot (v4), flash-safe fallback demo, query-first data layer, solid test coverage of publish lifecycle.
- Why not higher: zero admin curation of showcase content (auto-derived sessions/programs/charts), feature tabs attached to the frame with no narrative copy, no skeleton/loading states (sections unmount while loading → CLS), fetch starts late (post-mount, `no-store` + cache-buster defeats HTTP caching), Build tab is off-message, hero tooltips are hover-only (broken on touch), programs tab hardcodes `isMobile={false}`.

**This plan targets S+** via: schema v5 with admin-curated showcase settings; a detached, narrated two-column Features section reusing real app surfaces; module-scope prefetch + HTTP caching so examples arrive with the page; full skeleton states; and a deliberate 980/620px responsive system with touch-correct interactions — with backend + frontend test coverage for every new behavior.

---

## Part 1 — Backend: schema v5, curated showcase, options endpoint, caching

### 1a. Draft settings shape (`AppSetting` key `landing_example_settings`)

Each example gains an optional `showcase` object (no new table):

```json
{
  "root_id": "uuid", "label": "...", "sort_order": 0,
  "showcase": {
    "session_id": "uuid|null",
    "activity_ids": ["uuid"],            // max 4
    "program_id": "uuid|null",
    "program_start_date": "YYYY-MM-DD|null",
    "program_end_date": "YYYY-MM-DD|null",
    "chart_ids": ["session-duration-trend"]
  }
}
```

### 1b. `validators.py` (next to `LandingExampleSelectionSchema`, ~line 381)

New `LandingExampleShowcaseSchema`: fields above; `activity_ids` unique + max 4; dates validated with `date.fromisoformat`; `program_end_date >= program_start_date`; ids sanitized. Add `showcase: Optional[LandingExampleShowcaseSchema] = None` to `LandingExampleSelectionSchema`.

### 1c. `services/admin_service.py`

- `LANDING_EXAMPLE_SCHEMA_VERSION = 4 → 5` (line 80). Add options-list bounds (sessions 50, activities 200).
- `_normalize_landing_example_settings` (line 353): preserve a normalized `showcase` dict (known keys only, absent → `None`/`[]`).
- New `get_landing_example_options(root_id)` for the admin pickers — validates admin-owned root (reuse `_validate_landing_example_roots` query), returns bounded picker lists:
  - sessions via `SessionService.get_fractal_sessions(root.id, root.owner_id, limit=50, sort desc)` → `{id, name, session_start, total_duration_seconds, completed}`
  - activities via `ActivityDefinition` query (root, not deleted, `selectinload(associated_goals)`) → `{id, name, group_id, associated_goal_count}` (count lets admin UI warn when the inheritance demo would be empty)
  - programs via `ProgramService.get_programs(...)` → `{id, name, start_date, end_date, color, blocks: [{id, name, start_date, end_date}]}`
  - Use `root.owner_id` as acting user (publishing admin may differ from root owner — mirrors `_build_landing_showcase_data` line 739).
- New `_resolve_landing_showcase(root, showcase)`: verifies referenced session/program/activities still exist under the root; **drops stale refs instead of failing publish** and returns `showcase_warnings` surfaced in the publish response.
- `_build_landing_showcase_data` (line 738):
  - If featured `session_id` isn't in the recent-4, fetch it via `SessionService.get_session_details(root.id, session_id, root.owner_id)` and prepend.
  - Add featured `activity_ids` to the activity-id set before the `ActivityDefinition` query so featured activities always serialize.
- `publish_landing_examples` (line 800): each published example gains a fully-populated `showcase` key (nulls/empties when unset); `schema_version: 5` at example + cache level. v4 caches stay readable (frontend handles missing `showcase`).

### 1d. `blueprints/admin_api.py`

New thin route `GET /api/admin/landing-examples/options?root_id=<id>` (~line 193), same auth/error pattern as siblings.

### 1e. `blueprints/public_api.py` — HTTP caching

Line 28: `Cache-Control: no-store` → `public, max-age=300, stale-while-revalidate=86400`. Safe: cache only changes on manual publish; worst case 5 min stale.

## Part 2 — Frontend data: prefetch, query key, v4 compat, fallback

- `client/src/hooks/queryKeys.js`: add `landingExamples: () => ['public', 'landing-examples']`; Landing.jsx:337 uses it.
- Extract `isPublicMarketingHost` from `AppRouter.jsx:35-44` into new `client/src/utils/marketingHost.js` (AppRouter re-exports for compat).
- New `client/src/utils/landingPrefetch.js`: `maybePrefetchLandingExamples(queryClient)` — if `location.pathname === '/landing'` or (`/` + marketing host), `queryClient.prefetchQuery` with the same key/queryFn/staleTime. Call it in `client/src/main.jsx` right after `queryClient` creation, so the network request starts at JS boot; Landing's `useQuery` dedupes against it.
- `client/src/utils/api/publicApi.js`: **remove the `_: Date.now()` cache-buster** so the new Cache-Control actually engages (repeat visits render instantly from HTTP cache).
- `Landing.jsx` `publishedExamples` memo (line 351): map through `showcase: example.showcase || null`. All v4 fallbacks computed in the Features section: featured session → `sessions[0]`; featured activities → first ≤4 with non-empty `associated_goal_ids`; featured program → `programs[0]` with no clipping; charts → all.
- Fallback demo snapshot (Landing.jsx:86-238): add a matching `showcase` block (`program_start_date`/`program_end_date` spanning the demo block) and add `associated_goal_ids`/`associated_goals` to the demo activity definition so the inheritance demo works offline.

## Part 3 — New Features section (replaces `LandingShowcaseFrame`)

New files in `client/src/components/landing/`:

- **`LandingFeaturesSection.jsx`** — orchestrator, `<section id="features">`. Props `{ example, seedLevels, isMobile, isLoading, onGoalSelect }`.
  - Section header from new `landingContent.features` (eyebrow/title/body).
  - **Detached feature toggle row**: standalone segmented control (`role="tablist"`, pills styled like `.exampleToggle`), visibly separated from the stage below — fixes the fused-tab-strip complaint. Features: `session | activity | programs | analytics | more`; labels from content.
  - **Two-column body** (≥980px): left `featureInfo` = active feature's heading + body copy; right `featureStage` = active panel inside `GoalLevelsProvider seedLevels`. Mobile: stacked, info first. Stage has per-breakpoint `min-height` so toggling doesn't reflow.
  - `isLoading` → full section chrome with skeletons in both columns.
- **`LandingFeatureSession.jsx`** — ONE featured session via `SessionCardExpanded` (prop set proven at LandingShowcaseFrame.jsx:48-61).
- **`LandingFeatureActivity.jsx`** — chip selector over featured activities (≤4); selected activity rendered via existing `ActivityPreviewCard`; beside it a goal-inheritance lineage view reusing **`GoalHierarchyList`** (`variant="session"`, `connectorHighlightMode="lineage"`): nodes from `flattenGoalTree(example.tree)` filtered to goals whose `attributes.associated_activity_ids` include the activity + all ancestors (helper in new `landingFeatureModel.js`, modeled on `collectIdsWithAncestors` in `useSessionGoalsViewModel.js:49-64`; fall back to the definition's `associated_goal_ids`). Highlight state: `'target'` for associated goals, `'ancestor'` for ancestors (mirrors SessionGoalHierarchyPanel.jsx:70-79). `onGoalClick` → `onGoalSelect` scrolls to `#examples` and selects the goal in the live tree.
- **`LandingFeaturePrograms.jsx`** — featured program only; **clip calendar events to `[program_start_date, program_end_date]`** (filter `buildProgramsCalendarEvents` output + block labels by overlap with the window); `initialDate` = window start (fallback: first event). Pass real `isMobile` (current code hardcodes `false` — fix).
- **`LandingFeatureAnalytics.jsx`** — charts filtered/ordered by `showcase.chart_ids` (empty → all); if >1, chart-title chips above a fixed-height chart box; `Bar`/`Line` + `DISABLED_CHART_ANIMATION` as today.
- **`LandingFeatureMore.jsx`** — card grid from `landingContent.features.extras`: notes, progress tracking, light/dark mode, custom goal icons. Light/dark card hosts a **real theme toggle** via `useTheme()` (flips `data-theme` live); icons card renders sample `GoalIcon`s.
- **`LandingFeaturesSection.module.css`** — `grid-template-columns: minmax(280px, 380px) 1fr; gap: 32px` collapsing <980px; toggle row `overflow-x: auto` + ≥44px touch targets on mobile; stage `max-width: 100%; overflow: hidden`; skeleton shimmer.
- **`LandingSkeleton.jsx`** — tiny shared shimmer block used by Features + Examples sections.

Wiring/removals in `Landing.jsx`:
- Replace `<LandingShowcaseFrame .../>` (lines 728-733) with `<LandingFeaturesSection ...isLoading={landingExamplesQuery.isPending}/>` — rendered even while loading (not gated on `selectedExample`).
- Delete `LandingShowcaseFrame.jsx`, `TemplatePreviewCard.jsx`; move the card styles `ActivityPreviewCard` needs into the new module and delete `LandingShowcaseFrame.module.css`; trim `__tests__/LandingPreviewCards.test.jsx`.
- Header nav anchor `#showcase` → `#features`.

## Part 4 — Content (`landing.md` + parser)

- `client/src/content/landing.md`: new `## Features` section (eyebrow/title/body + `### Session/Activity/Programs/Analytics/More` sub-blocks with `**Label:**`, `**Heading:**`, body) and `## Feature Extras` (`### Notes / Progress tracking / Light & dark mode / Custom goal icons` cards).
- `client/src/content/landingContent.js`: add `features` (items + extras) to `fallbackContent` with full copy (markdown failure must not blank the section); add `label`/`heading` to `metaKeyMap`; parse via existing `getNestedSection`/`readMetadata`/`readBody`/`readCards` helpers; merge over fallback per-feature.

## Part 5 — Loading states + responsive/mobile

- Examples section: render the shell while `landingExamplesQuery.isPending` — skeleton pills in the example toggle + skeleton viewport at the real `.flowTreeViewport` height (no CLS). Keep the existing flash-safe fallback swap (Landing.jsx:341-347) untouched.
- Hero tooltips (Landing.jsx:584-610): hover-only today → controlled toggle (`activeLevel` state; visible on hover OR focus-visible OR tap; `aria-expanded`; outside-tap dismiss; hover rules under `@media (hover: hover)`).
- Features: two-column → stacked at 980px; reduced stage heights at 620px; toggle row horizontal-scrolls on mobile; no horizontal page overflow (`featureStage` clamps).

## Part 6 — Admin UI (`client/src/pages/Admin.jsx`, `LandingExamplesPanel` lines 236-433)

- `client/src/utils/api/adminApi.js`: add `getLandingExampleOptions(rootId)`.
- Draft items gain `showcase` (defaults: nulls/empty arrays); hydrate from GET response.
- Per selected example, collapsible **Showcase editor** (new `LandingExampleShowcaseEditor` in Admin.jsx): lazy `useQuery(['admin','landing-example-options',rootId], enabled: expanded)`;
  - Session `<select>` ("Auto — most recent" default), Activities checkbox list capped at 4 (warn glyph when `associated_goal_count === 0`), Program `<select>` + start/end `<input type="date">` (defaulted from the program's block range, end ≥ start), Chart checkboxes (`session-duration-trend`, `activity-time-totals`; none = all).
- Publish response `showcase_warnings` surfaced via `notify`. Styles in `Admin.module.css`.

## Part 7 — Tests

Backend (`tests/integration/test_admin_api.py`, extend suite at 374-500):
1. PATCH round-trip persists `showcase`; normalization keeps it.
2. Validation: >4 activity_ids, duplicate ids, bad/inverted dates → 400.
3. Publish honors showcase: featured old session included; featured activity not in recent sessions still serialized; `showcase` + `schema_version: 5` present; charts unaffected.
4. Stale showcase refs → publish succeeds, refs dropped, warnings returned.
5. No showcase → stable v5 shape with nulls/empties.
6. Options endpoint: bounded lists; non-admin-owned root rejected; non-admin 403.
7. Public endpoint asserts new Cache-Control header (`tests/integration/test_public_beta_signups_api.py`).

Frontend (Vitest):
1. New `LandingFeaturesSection.test.jsx`: toggle switches info copy + stage; toggle row not nested inside stage frame; v5 showcase honored (featured session, clipped program window, filtered charts); v4 (`showcase: null`) fallbacks; activity lineage renders target + ancestor highlight states; extras render; theme toggle flips `data-theme`.
2. Update `Landing.test.jsx`: `#showcase` → `#features` assertions (lines ~324, 369-389); new skeleton-while-pending test; existing no-flash test (line 402) keeps passing.
3. Update `landingContent.test.js` for Features/Extras parse + fallback.
4. Trim `LandingPreviewCards.test.jsx`; unit tests for `marketingHost.js`, `landingPrefetch.js`, `landingFeatureModel.js` lineage helper.

## Sequencing

0. Save this plan to `/planning/landing-page-revamp.md` (per CLAUDE.md).
1. Backend schema v5: validators → normalize → resolve → showcase build → publish → tests.
2. Options endpoint + tests (parallel-safe with 1).
3. Caching + prefetch plumbing (Cache-Control, cache-buster removal, queryKeys, marketingHost, landingPrefetch, main.jsx).
4. Content: landing.md + parser + tests.
5. Features section components + lineage helper + CSS + Landing.jsx wiring + fallback snapshot + Build-tab removal.
6. Skeletons + responsive polish + hero tooltip touch handling.
7. Admin showcase editor.
8. Full test sweep + manual verification.

## Verification

- `./run-tests.sh backend` and `cd client && npm run test:run` (or `./run-tests.sh frontend`).
- Manual: run Flask (8001) + Vite (5173); visit `/landing` — examples render with skeletons under throttled network and no fallback flash; feature toggles detached with narrative copy; 375px viewport: stacked columns, scrollable toggles, tap-tooltips, no horizontal overflow. Admin tab: pick session/activities/program window/charts → save → publish → landing reflects picks (after 5-min HTTP cache or hard reload). Simulate v4 cache by stubbing the query response without `showcase` → fallbacks engage.

## Risks

- v5 cache + old frontend / v4 cache + new frontend are both safe (extra key ignored / null fallbacks). Cleanest deploy: backend first, re-publish, then frontend.
- `get_session_details` commits recomputed stats during publish — harmless, but tests should expect it.
- Calendar measurement inside a fixed-min-height stage on feature-switch remount needs a manual check (existing showcase already does this successfully).
