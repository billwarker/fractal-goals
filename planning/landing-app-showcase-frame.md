# Landing "See It Across the App" — Reusable Read-Only Showcase Frame

## Context

The goals explorer on `/landing` proved a pattern: render the **real** app components in a read-only, snapshot-fed mode (real `FlowTree` + `GoalDetailModal`, no rebuild, no authenticated API). The user now wants to extend this to showcase the rest of the app (Sessions, Programs, Analytics, and how activities/templates/metrics are built) and asked whether an **iframe** would be simpler.

**Decision: no iframe.** In this codebase every page is auth-gated at the data layer (`useFractalTree`/`useActivities`/`usePrograms` → authenticated endpoints; `axios.defaults.withCredentials = true` + CSRF interceptor in `client/src/utils/api/core.js`). An iframe would (a) require building public, unauthenticated mirrors of every endpoint (more work + re-opens the data-exposure surface the snapshot was designed to avoid), (b) boot a second cross-origin React app per embed (`fractalgoals.com` landing vs first-party-cookie `my.fractalgoals.com`), and (c) forfeit the read-only/curation control we deliberately built. The snapshot+real-component path keeps one rendering path (no UI drift), no second app, and enforceable read-only.

Confirmed decisions:
- **Embed core components, not full route screens** (the pages are deeply coupled to `useParams().rootId`, `navigate()`, `useGoals()` mutations, search params). Mirror what goals did: reuse the value-carrying component, skip the page chrome.
- **Build flows show the built *result***, not the builder. `ActivityBuilder`/`CreateSessionTemplate` are mutation-first forms (LARGE to neuter); instead show finished example activity/template cards (read-only preview), reusing display bits like `ActivityCard`.
- **Single tabbed showcase frame** ("See it across the app" with Sessions / Programs / Analytics / Build tabs), reusing the existing example-toggle pattern in `Landing.jsx`.

## Scope findings (effort per core component)

| Showcase | Real component reused | Effort | Why |
|---|---|---|---|
| Sessions | `components/sessions/SessionCardExpanded.jsx` | **S** | Props-first; only contexts (`useGoalLevels`, `useRootProgressSettings`) + disable callbacks/links |
| Programs | `components/programs/ProgramCalendarView.jsx` | **S** | Stateless FullCalendar; accepts pre-built `calendarEvents`/`blockLabels`; disable create/nav |
| Analytics | `components/analytics/ChartJSWrapper.jsx` + `visualizations/registry.js` | **M** | Wrapper is stateless config-gen; bypass the interactive `ProfileWindow`, feed precomputed chart `data`/`options` |
| Build (result) | `components/sessions/ActivityCard.jsx` + small preview cards | **M** | New lightweight `ActivityPreviewCard`/`TemplatePreviewCard` (do NOT reuse the builder forms) |

`SessionCardExpanded` and `ProgramCalendarView` depend on `useRootProgressSettings(rootId)` / progress context and `TimezoneContext` — need either app-wide availability (Timezone is global) or a seeded/prop path like we did for `GoalLevelsProvider seedLevels`.

## Database / Snapshot Grade (current): **B+**

The snapshot is a clean, versioned (`schema_version: 3`) self-contained read model for the *goals* surface (goals/targets/activities/timeline/notes + root-level evidence/metrics/programs). For this feature:

- ✅ Publish pipeline, public endpoint, versioning, and the seed-context pattern all exist and are reusable.
- ✅ `programs` already embedded (drives both the goals overlay AND the programs showcase).
- ✅ Activities already embedded per goal (feeds the build-result cards).
- ⚠️ No **sessions** data in the snapshot (the sessions showcase needs a few example sessions with activity instances + the serializers `SessionCardExpanded` consumes).
- ⚠️ No precomputed **analytics chart data** (the analytics showcase needs a small set of ready-to-render chart payloads, since there's no public analytics API).
- ⚠️ No **session templates** in the snapshot (for the template-result card).

## Target Grade: **S+**

- One published snapshot becomes a complete frozen mirror across the app's surfaces: goals (done) + a handful of example sessions, a programs calendar, a couple analytics chart payloads, and example activity/template cards — all rendered by the real components in read-only mode, zero public API beyond the existing cache endpoint.
- One reusable `<LandingShowcaseFrame>` + a thin read-only data seam per component; no UI drift, no iframe, no second app.

---

## Implementation Plan

### Step 1 — Extend the published snapshot with the new showcase data (backend)
`services/admin_service.py` (`publish_landing_examples`), reusing existing serializers/services with the admin `owner_id`.

- **Sessions**: pull a bounded set (e.g. 3–5) of the example root's real sessions via the existing session list/serializer path (the same payload `Sessions.jsx` consumes — `serialize_session`-family), including the `activity_instances` and section structure `SessionCardExpanded` needs. Store as `example["sessions"]`.
- **Analytics**: call the existing analytics summary service (`get_session_analytics_summary` / goal analytics) for the root, and precompute **a small fixed set of chart payloads** (e.g. session-trend bars, activity totals) in the exact `{ data, options, type }` shape the chart renderer expects — store as `example["analytics_charts"]`. (Whole-fractal, static — same non-reactive tradeoff already accepted for the metrics overlay.)
- **Templates**: serialize the root's session templates (existing `serialize_session_template`) → `example["session_templates"]` for the build-result card. (Activities are already embedded per goal; reuse those for the activity card.)
- Bump `LANDING_EXAMPLE_SCHEMA_VERSION` to `4`.
- `public_service.py` passes examples through verbatim — only the version it echoes changes.
- Extend `tests/integration/test_admin_api.py` to assert `sessions`/`analytics_charts`/`session_templates` lists + `schema_version == 4`.

### Step 2 — Reusable showcase frame + tabs (frontend)
`client/src/pages/Landing.jsx` + a new `client/src/components/landing/LandingShowcaseFrame.jsx` (+ module CSS).

- New `LandingShowcaseFrame` owns the tab strip (Sessions / Programs / Analytics / Build) and renders the active read-only view, reusing the same tab/toggle styling already used for the example-fractal toggle.
- Add a "See it across the app" `<section>` to `Landing.jsx` below the existing examples explorer, fed from the selected example's snapshot data. Tabs swap the embedded view; one frame component, reused.
- Thread the new snapshot fields (`sessions`, `analytics_charts`, `session_templates`) through the `publishedExamples` memo alongside the existing data.

### Step 3 — Read-only seams on the reused display components
Per the established `readOnly` convention (`GoalDetailModal` — disable queries, accept inbound data as fallback, gate callbacks):

- **Sessions** — `SessionCardExpanded`: add a `readOnly` path that takes `session`/`activities`/`activityGroups`/`instances` via props (already mostly props), no-ops `onSelect`/`onRequestDelete`/`onOpenGoal`, and renders detail-page Links as plain text. Wrap in seeded contexts (`GoalLevelsProvider seedLevels=…`, and a progress-settings prop/seed) like the goals modal.
- **Programs** — `ProgramCalendarView`: pass precomputed `calendarEvents`/`blockLabels` from the snapshot, `showBlockControls={false}`, and no-op the create/date-select/navigation callbacks.
- **Analytics** — render via a thin `ChartJSWrapper` panel that consumes a precomputed `analytics_charts` entry directly, bypassing the interactive `ProfileWindow`/filters/date-range state.

### Step 4 — Build-result preview cards (new, lightweight)
`client/src/components/landing/ActivityPreviewCard.jsx` + `TemplatePreviewCard.jsx`.

- Small display-only cards (NOT the builder forms): activity card shows name + metric chips (reuse `ActivityCard` or the `ReadOnlyActivitiesView` metric-indicator style already added); template card shows name/type + sections + activity names from `session_templates`.
- These render under the "Build" tab to demonstrate what built activities/templates/metrics look like, without embedding any mutation-driven form.

### Step 5 — Tests
- Backend: `tests/integration/test_admin_api.py` asserts the new snapshot fields + `schema_version == 4`.
- Frontend: extend `client/src/pages/__tests__/Landing.test.jsx` (mock the snapshot with `sessions`/`analytics_charts`/`session_templates`) — assert the showcase frame renders, tabs switch the active view, and each view receives read-only data. Add focused tests for the two new preview cards.
- Run `./run-tests.sh frontend` and `./run-tests.sh file tests/integration/test_admin_api.py`.

---

## Critical files

- `services/admin_service.py` — embed sessions / analytics_charts / session_templates; bump schema to 4.
- `client/src/pages/Landing.jsx` — new showcase section + thread snapshot data.
- `client/src/components/landing/LandingShowcaseFrame.jsx` (new) — tabbed frame.
- `client/src/components/landing/ActivityPreviewCard.jsx`, `TemplatePreviewCard.jsx` (new) — build-result cards.
- Reused as-is (read-only path added): `components/sessions/SessionCardExpanded.jsx`, `components/programs/ProgramCalendarView.jsx`, `components/analytics/ChartJSWrapper.jsx`, `components/sessions/ActivityCard.jsx`.
- Reused patterns: `GoalLevelsProvider seedLevels` (`contexts/GoalLevelsContext.jsx`), the `readOnly` convention in `GoalDetailModal.jsx`, the example-toggle tab styling in `Landing.jsx`, existing backend serializers (`serialize_session*`, `serialize_session_template`, analytics summary services).

## Verification

1. `./run-tests.sh frontend` and the targeted backend integration test pass.
2. Manually (run/verify): publish an admin fractal that has sessions/programs/templates/analytics history, open `/landing` → the "See it across the app" frame shows tabs; each tab renders the real component read-only with example data; no edit affordances; clicking inert controls does nothing.
3. DevTools network on `/landing`: still only the single `/api/public/landing-examples` request — no authenticated sessions/analytics/programs/templates calls.
4. Re-publish requirement called out in UI: showcase data is a cached snapshot; it refreshes on publish.

## Honest tradeoff

This front-loads work per surface: each showcase needs (a) its data added to the snapshot and (b) a thin read-only seam on the real component (or a small preview card for build flows). That's real effort, but it's strictly less than the iframe path (which needs public endpoint mirrors + cross-origin auth + a second app boot) and it keeps a single, drift-free rendering path. If you later want **interactive** demos (visitors create/run things), revisit a sandboxed demo-account approach then — not now.
