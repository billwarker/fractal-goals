# Private Beta Polish — Theme, Loading, Settings/Logs, Mobile, Landing, Onboarding

Branch: `feat/beta-launch-polish` · On approval, save as `planning/beta-launch-polish-2026-11.md`

## Context

The app is being prepared for its private beta. Most development happened in dark mode, so light mode is too bright and some colours don't work, such as the flow tree's connecting lines. Loading messages vary from page to page, and cold starts on Cloud Run show either nothing or a misleading "offline". Settings and Logs look dated. Mobile has never had a systematic pass. The landing page and onboarding lag behind the product.

This block of work makes the app feel finished on every surface, in both themes and on phones. It runs in phases, with a review checkpoint after each one.

Decisions already made:
- Light mode keeps the WinClassic colours but modern shapes.
- Logs stay admin-only.
- The landing page's main action is a waitlist, followed by an emailed invite.
- Onboarding gets a welcome flow, a guided first fractal, and a refreshed checklist.

---

## Current grade (F → S)

| Area | Grade | Why |
|---|---|---|
| Theme system | **C** | The token setup is good: one file (`design-tokens.css`), applied via `data-theme`, with charts reading CSS variables. But the light palette is a generic blue-white. About 48 colour tokens have no light override, including brand, heatmap and log colours. Goal level colours are the same in both themes, and their secondary colours are near-black, designed for dark mode. `--color-accent` is used by charts but never defined. About 190 hard-coded colours exist in JS/CSS, e.g. dark-only `SelectActivitiesModal.jsx:179`, `GoalCompletionTimeline.jsx`, `AnnotationLayer.jsx`. Theme is stored only in localStorage, with no System option once the user toggles, and nothing syncs between devices. |
| Loading states | **D** | About 87 ad-hoc "Loading…" strings using about 20 different classes, mixing `...` and `…`. 17 route Suspense fallbacks use `.loading-spinner`, a class that is never defined, so they render as unstyled text. `LoadingState` is used in 3 places. In `Sessions.jsx:467` the label prop is misnamed, so it shows "Loading...". On the app host nothing paints before the JS bundle loads. A Cloud Run cold start (scale to zero, `/api/readyz` probe) can time out into the "Offline" state with no "waking up" message. |
| Settings | **C−** | A 588-line `SettingsModal.jsx` that uses none of the `atoms/` form primitives. Labels are missing or placeholder-only. Widths and heading styles vary. Tabs are `aria-pressed` buttons rather than a real tablist. Theme is a single toggle button. AI Connections shows even when its flag is off. |
| Logs | **C** | It works: filters, 50 per page, and admin-only clearing. But it uses global `Logs.css`, a fixed 4-column grid that breaks on mobile, no activity overview, and no aggregate endpoint. |
| Mobile | **C+** | Good building blocks: `useIsMobile`, `ResponsiveSidePane` sheets, `MobilePageFooter`, and a regex source check (`responsive-audit.mjs`) in CI. However, there are 15 different max-width breakpoints, and the breakpoint tokens are unused. `atoms/Modal` is only a centred card on phones (just one caller uses `sheetHandle`). 14 modals are built on bespoke `ModalBackdrop`s. There is no rendered-layout checking: no overflow or tap-target assertions and no screenshot review. |
| Landing | **B−** | Impressive reuse of real components through published snapshots, and a boot skeleton. But the copy is stale: no circuits, completion conditions, timeline heatmap, offline, tags, reviews or sequences. "Feature Extras" and "And more" never render. Wheel-hijacked horizontal snapping on desktop. Phones get scaled-down desktop previews. Only one e2e test. |
| Onboarding | **D+** | A solid server-side state model (revisioned, per fractal). But the flag defaults off, and it is only a floating checklist card. There is no welcome screen for someone with zero fractals, the copy has drifted since July, and mobile gets the same corner card. |
| **Overall** | **C+** | Strong foundations with an uneven finish. The fixes are largely systemic (tokens, primitives, harnesses) rather than one page at a time. |

## What S+ looks like

- **Every colour is a token**, and lint stops new raw colours (ratcheted).
- **Both themes are tested.** A contrast script verifies WCAG ratios for every text/background and line/canvas pair.
- **One loading system with time-based escalation.** It shows a skeleton, then "still working", then "waking the server", then retry. The app-host boot shell shows the same loader before the bundle loads, so the handoff is seamless.
- **Settings is built from the shared atoms**, drills in on mobile, and syncs appearance between devices.
- **A rendered-layout harness.** It checks every route and modal at 3 phone/tablet viewports × 2 themes, with automatic overflow, tap-target and axe checks, and produces a contact sheet we review together each round.
- **The landing page tells the current product story,** scrolls natively on every device, and turns visitors into waitlist sign-ups. Invited users go straight to signup with their key already filled in.
- **First run is guided:** welcome, then the first fractal, then the first session. An e2e test covers the whole journey.

---

## Phase 0 — Review harness (built first; used by every later phase)

Goal: make "check across the app on mobile and in both themes" a single command, not hours of manual clicking.

- **`client/e2e/sweep/manifest.js`** lists every surface: each route, plus every modal and sheet opened via a small `open(page)` step (e.g. Settings tabs, Goal Detail, Create Session, Activity picker, Program options, Filter modals, Auth).
  - Seeding: reuse `scripts/browser_test_server.py` with one realistic "power user" seed (goals in all 5 levels, sessions with circuits, programs, notes with media placeholders, logs).
- **`client/e2e/sweep/sweep.spec.js`** runs every manifest entry at 360×740, 390×844 and 768×1024 (plus a 1440 desktop reference), each in light and dark. For each one it:
  - takes a full-page screenshot into `test-results/sweep/<surface>/<viewport>-<theme>.png`;
  - **asserts** there is no horizontal overflow (`scrollWidth > innerWidth`) and that no interactive element is under 40×40px on a touch viewport (with an allowlist file);
  - runs axe-core (`@axe-core/playwright`, a new devDependency) for colour-contrast and labelling.
- **`client/scripts/sweep-report.mjs`** builds one `sweep-report.html` contact sheet: a grid per surface, showing light/dark × viewports, with failing checks flagged. It is opened locally, and that is the review loop for us to go through together.
- **`npm run sweep`** (local) and **`npm run sweep -- --grep <surface>`** for re-checking a single surface. CI runs only the assertions (no image diffing yet). Pixel baselines (`toHaveScreenshot`) are added after Phase 4, once the UI is stable.

## Phase 1 — Theme: WinClassic light mode, schedule, and theme-aware colours

**1a. Light palette rewrite** (`client/src/design-tokens.css`, `[data-theme="light"]` block). WinClassic mapping:

| Role | Token(s) | Light value |
|---|---|---|
| App canvas | `--color-bg-app` | `#E4E2DD` (warm grey, between `#D4D0C8` and `#EFEFEF`) |
| Cards / surfaces / modals | `--color-bg-card`, `-surface`, `-elevated` | `#F3F3F1` (no pure white) |
| Inputs | `--color-bg-input` | `#FFFFFF` (WinClassic inputs are white: the one white element) |
| Chrome (header, sidebar, section headers) | `--color-bg-header`, `-sidebar` | `#D4D0C8` / `#EEEEEE`, section headers `#DEDEDE` |
| Borders | `--color-border`, `-card` | `#B9B5AD` / `#C8C8C8`; hover `#808080` |
| Text | `--color-text-primary/secondary/muted` | `#000000` / `#3C3C3C` / `#5F5F5F` (muted ≥ 4.5:1 on cards) |
| Primary / selection | `--color-brand-primary` (light override) | `#0058D6` (darkened `#0066FF` for AA on grey); selection fill `#0066FF` + white text |
| Navy accent | new `--color-accent` (fixes the undefined chart token) | `#0000A2` in light, current pink/orange role in dark |
| Status | success / danger / warning | `#036A07` / `#C5060B` / `#B35C00` (WinClassic green, red, amber) |
| Teal / magenta (charts, tags) | `--chart-series-*` | Re-derived from `#318495`, `#B90690`, `#1E39F6`, `#036A07`, `#C5060B`, `#CD9731`… and checked with the dataviz skill's validator |
| Shadows | `--shadow-*` | Smaller, crisp, neutral `rgba(0,0,0,.12–.2)`, WinClassic flat with a 1px edge |
| Flow tree | new `--flowtree-edge`, `--flowtree-edge-muted`, `--flowtree-edge-glow`, `--flowtree-canvas-grid` | edge `#5A5A5A` (≥ 3:1 on canvas), no glow in light |

- Add light overrides for the ~48 shared colours: brand, heatmap 1–4, `--color-log-*`, `--color-mode-*`, and the `*-soft`/`*-muted` tints.
- Delete the no-op `@media (prefers-color-scheme: light)` block in `index.css:152-161`.

**1b. Theme-aware goal colours.** Users customise these per fractal, so they stay single stored values and get **adapted at render time**:
- **New `client/src/utils/themeColors.js`:** `adaptForTheme(hex, theme, role)`, where role is `fill|stroke|text|secondary`. It uses OKLCH lightness clamping, so light mode darkens pale fills and strokes and lightens the near-black secondaries. The function is pure, and unit tests check contrast against the canvas token.
- **`GoalLevelsContext.jsx`:** `getGoalColor`, `getGoalSecondaryColor` and `getGoalTextColor` read `resolvedTheme` from `ThemeContext` and adapt the colour, so every consumer gets the change without being touched.
- **`flowTreeGraphUtils.js`:** edges use `--flowtree-edge`. Completed-edge colours are adapted, and the `'#FFD700'` default is removed. In `FlowTree.css`, the drop-shadow glows are dark-only.

**1c. Hard-coded colour sweep and gate.**
- Fix the worst offenders:
  - `SelectActivitiesModal.jsx`
  - `GoalCompletionTimeline.jsx`, `AnnotationLayer.jsx` (move these onto `useChartThemeDefaults`)
  - the three ErrorBoundaries
  - `PageSurface.css`, `Admin.module.css`, `Logs.css`, `Badge.module.css`, `VideoEmbed.module.css`, `GoalHierarchyList.module.css`, `GoalDetailModal.module.css`
- Add a rule to `scripts/maintainability-audit.mjs` that fails on raw hex, `rgb()` or `rgba()` outside `design-tokens.css`. `var(--x, #fallback)` fallbacks are allowed, and an explicit per-file baseline ratchets down to zero. Black/white transparent overlays are expressed as tokens (`--color-scrim`, `--color-shadow-ink`).
- **New `client/scripts/check-theme-contrast.mjs`** (added to `./run-tests.sh lint`) parses both token blocks. It asserts text on each background (primary/secondary ≥ 4.5, muted ≥ 4.5 on cards and ≥ 3 on chrome), edge on canvas ≥ 3, border on card ≥ 1.5, and focus ring ≥ 3.

**1d. Theme modes and schedule** (the new Settings → Appearance controls, see Phase 3):
- **Preference shape:** `{ mode: 'system' | 'light' | 'dark' | 'schedule', darkFrom: '20:00', lightFrom: '07:00' }`. Times are in device-local time.
- **New `client/src/utils/themeSchedule.js`** has pure functions: `resolveTheme(pref, now, systemDark)` and `nextSwitchAt(pref, now)`, which handles overnight ranges and the case where both times are equal. Shared cases live in `tests/fixtures/theme_schedule_cases.json`.
- **`ThemeContext.jsx`:**
  - Exposes `preference`, `resolvedTheme` and `setPreference`; `toggleTheme` is removed.
  - Sets a timer to the next switch, and re-checks on `visibilitychange` (so a sleeping laptop catches up).
  - Uses a short colour transition on `<html>` when the switch is scheduled rather than user-driven, and `prefers-reduced-motion` turns that transition off.
  - Persists to localStorage (`theme-preference`, migrating the legacy `theme` key) and to `user.preferences.appearance` via the existing `PATCH /api/auth/preferences`, merging the server value on login. Uses `utils/localPreferences.js` for safe storage access.
- **`client/public/boot/shell.js`** has a small copy of the resolver, checked against the same fixture by a Vitest test, so a scheduled dark theme applies before first paint with no flash.
- **Backend:** the validator for the `appearance` key in `validators/auth.py` (enum and HH:MM) is strict. It rejects bad values with 422 instead of storing them.

**Checkpoint 1:** you review the light/dark contact sheet across all surfaces, and we tune the values together. Expect 1–3 rounds.

## Phase 2 — One loading system

- **`components/common/LoadingState.jsx`** becomes the single component. Props:
  - `variant`: `page | section | inline | overlay`
  - `label`
  - `skeleton`: `list | cards | tree | chart | detail`, optional, and shows a matching skeleton shape
  - `delayMs`: default 200, so nothing flashes on fast loads
- It escalates over time through a new `hooks/useLoadEscalation.js`:
  1. After 200 ms: the skeleton or spinner and its label.
  2. After 4 s: "Still loading…"
  3. When the API layer reports `warming`: "Waking up the server. The first load after a quiet spell can take up to 20 seconds." with a gentle progress shimmer.
  4. When the request fails or reaches its timeout: an inline **Retry** that refetches the owning query.
- It renders `role="status"` / `aria-busy`, and consistently uses `…` in its labels.
- Merges `atoms/Spinner`, `ChartLoading`, `AnalyticsLoading` and `LandingSkeleton` into it (each becomes a thin re-export or is deleted).
- **Cold-start awareness:**
  - `utils/api/core.js` records when a request has been in flight longer than 2.5 s without failing and then succeeds, and exposes a small `serverWarmth` store (`warm | warming`).
  - `offline/connectivity.js` treats "the health probe is slow but responds" as `warming`, not `offline`. A real failure still goes offline, which keeps the ADR-0004 outbox semantics.
  - `SessionSyncIndicator` gets a "Connecting…" state.
- **App-host boot shell:** `index.html` and `shell.js` paint a themed full-page loader (the same markup and CSS as `LoadingState variant="page"`) on the app host, not only the landing host. After 3 s with no bundle it shows "Waking up…". `main.jsx` hands it off as the landing shell does.
- **Migration:**
  - Replace every ad-hoc "Loading…" string, the 17 route fallbacks (with a single `<RouteFallback/>`), and the Suspense text fallbacks.
  - Fix the `Sessions.jsx:467` prop bug.
  - Fix the dynamic loading strings in `utils/planCopy.js` and `sessionActivityScope.js` so they feed a label.
- **Gate:** the maintainability audit forbids JSX text matching `/Loading(\.\.\.|…)/` and the `loading-spinner` class outside `LoadingState`.
- **Ops recommendation (needs your go-ahead; it costs money):** for the beta, set Cloud Run `--min-instances 1` and `--cpu-boost` in `cloudbuild.yaml`. That removes most cold starts, and the waking UI remains as a safety net.

**Checkpoint 2:** Playwright with route throttling (`page.route` adding a delay) demos each escalation stage, and a sweep subset shows the skeletons.

## Phase 3 — Settings and Logs refresh

**Settings** (`components/modals/SettingsModal.jsx` → `components/settings/`):
- **Split into one file per tab:**
  - `AppearanceSettings` (theme mode as a segmented control, schedule time pickers shown only for `schedule`, a live preview swatch, animated icons)
  - `GeneralSettings` (timezone)
  - `FractalSettings` (active-goal window, progress tracking, delta format)
  - `GoalCharacteristicsSettings` (moved)
  - `AccountSettings`
  - `StorageConnectionsPanel`
  - `AgentConnectionsPanel`
  - `GettingStarted`
- **New shared primitives:**
  - `atoms/Switch.jsx`
  - `atoms/SegmentedControl.jsx`
  - `settings/SettingsSection.jsx` (title and description)
  - `settings/SettingsRow.jsx`: a two-column grid of label + help text on one side and a control slot of fixed width on the other, stacking on mobile, with `htmlFor` wiring
- Every field uses `atoms/Input`, `atoms/Select`, `atoms/Checkbox` or `Switch`. The Account forms get real labels and inline errors.
- **Navigation:** a real ARIA `tablist` with arrow-key movement on desktop. On mobile (≤768) the tab list becomes a full-screen list that drills into each section with a back button, and the `?settings=<tab>` deep link still works.
- **AI Connections tab:** shown only when `aiAgentConnectors || aiAgentEmbedded` is on (matching `NavigationHeader`) **or** the user has existing connections (so they can still revoke them). If neither, the tab is filtered out of `SETTINGS_TABS`, and `initialTab` falls back to `general`.
- Delete the inline styles, and the unused `MetricInputSettingsFields.jsx` if it is confirmed dead.

**Logs (admin-only)**:
- **Backend:** `GET /api/<root>/logs/activity?start_date&end_date&tz&event_type&bucket=day|hour` returns `{ buckets: [{ start, total, by_domain: {goal: n, session: n, …} }], domains: [...] }`.
  - Implemented in `services/log_service.py` with `get_activity_series`.
  - SQL `date_trunc(bucket, timestamp AT TIME ZONE :tz)` grouped by bucket and `split_part(event_type,'.',1)`, using the existing `(root_id, timestamp DESC)` index.
  - Ranges are limited to 366 days for daily buckets and 14 days for hourly buckets, with gaps filled with zeros and the IANA timezone validated.
  - Same ownership check as `get_logs`.
  - Tests: unit tests for the bucket edges (day boundary in a non-UTC timezone, DST) and an integration test for tenant isolation.
- **Client:**
  - Convert `pages/Logs.css` to `Logs.module.css` and split it into `components/logs/` (`LogsActivityChart`, `LogsFilters`, `LogsTable`, `LogRow`).
  - The chart is a stacked bar by event domain via Chart.js and `useChartThemeDefaults` (built with the dataviz skill; domain colours become new `--color-log-*` tokens for both themes). Clicking or dragging on a bar range sets the From/To filters, and a 7d / 30d / 90d / custom range control drives both the chart and the table.
  - The table shows a relative time with the exact time in a tooltip, a domain chip, and an expandable payload JSON. On mobile it becomes stacked cards.
  - New query key under `logsRoot`, so Clear Logs invalidates the chart as well.

**Checkpoint 3:** Settings and Logs in the sweep, desktop and mobile, both themes.

## Phase 4 — Mobile UX pass

**Systemic changes first:**
- **Breakpoints:** standardise on `480 / 768 / 1024`, using `@custom-media` through `postcss-custom-media` (new devDependency) in `design-tokens.css`. Container queries handle component-level adaptation.
  - Move the 15 existing values to the nearest standard where layout allows. Keep values tied to a specific design (e.g. the landing 980) as named custom media.
  - The audit forbids new raw `max-width` px media queries.
- **Modals:**
  - `atoms/Modal` gets `mobilePresentation: 'sheet' | 'fullscreen' | 'card'`, defaulting to `sheet` at ≤640. The sheet docks to the bottom, uses the safe area, has a drag handle with swipe-to-dismiss (respecting focus trap and reduced motion), and its body scrolls under a sticky header and footer. Forms default to `fullscreen`.
  - Migrate as many of the 14 bespoke `ModalBackdrop` modals onto `atoms/Modal` as the design allows, and lower `BESPOKE_OVERLAY_FILE_BUDGET` to match.
- **Touch:** 44px minimum targets via a shared `--touch-target` token; give hover-only affordances `@media (hover: none)` equivalents; set inputs to ≥16px font so iOS doesn't zoom.
- **`responsive-audit.mjs`:** keep the regex rules that still matter. The rendered checks in the Phase 0 sweep take over the rest.

**Then page by page, in a loop with you:**
1. Run `npm run sweep`, then open the contact sheet.
2. I triage it into a checklist in `planning/beta-launch-polish-2026-11.md` (surface × issue × status).
3. Fix in batches by area:
   - Goals / flow tree / Goal Detail
   - Sessions / Session Detail / Create Session
   - Programs (calendar, Days)
   - Notes
   - Analytics
   - Manage Activities / Templates
   - Selection
   - Settings and the auth modal
4. Re-sweep, and you check on a real device: iPhone Safari is the one engine Playwright's Chromium misses, and WebKit sweeps are optional with `--project=webkit-mobile`.
5. Repeat until the checklist is clear.

Exit: zero overflow, tap-target and axe failures in CI on the three mobile viewports, and you have signed off on the device.

## Phase 5 — Onboarding refresh

- **Welcome flow** (`components/onboarding/welcome/`), shown on `Selection.jsx` when the user has zero fractals:
  1. **Welcome**: one sentence on the fractal model with an animated mini tree.
  2. **Your big goal**: the Ultimate goal name, with examples you can tap.
  3. **Break it down**: add 1–3 Long-Term goals, each optional, with live preview of the tree as you type.
  4. **Done**: create everything in one request, using the existing fractal-create and goal-create services. This request is idempotent via `Idempotency-Key` and is a single server transaction: new `POST /api/fractals/quickstart`, implemented in `services/_goal_fractals.py` and reusing the goal service. Then land on the Goals page with the tree in view.
- The flow is full screen on mobile, keyboard-navigable, and can be skipped ("I'll set it up myself").
- **Checklist** (`GettingStartedChecklist.jsx`, `onboardingSteps.js`, `onboardingSubsteps.js`):
  - Re-sequence the steps to match the current product: Explore your tree → Add an activity & metric → Run your first session → Set a completion condition → Plan a program.
  - Rewrite the copy, and give every step a "Show me" deep link.
  - On mobile it becomes a collapsible pill above `MobilePageFooter` that opens a sheet. Completing everything ends with a brief celebration.
  - The server keeps deriving completion, so no new trust boundary.
- **Teaching empty states:** audit the 21 `EmptyState` callers so each explains *why* and offers the one next action. Settings → Getting Started gets the new Section/Row styling.
- **Enable for beta:** turn the `onboarding_v1` flag on in admin. Existing users stay grandfathered under the existing logic.
- **e2e:** `client/e2e/onboarding.spec.js` covers invite link → signup prefilled → welcome → first fractal → first session → checklist progress, on desktop and mobile.

## Phase 6 — Landing page and the funnel

Last, so it presents the finished product. Its previews are real components, so it picks up every earlier phase.
- **Structure:** replace wheel-hijacked horizontal snapping with **native vertical scroll on all devices**. This gives a sticky section nav with scroll-spy (`useActiveLandingSection`), optional gentle `scroll-snap-type: y proximity`, and anchor links.
- **Narrative** (rewrite `content/landing.md`, `landingContent.js`, `landingFallback.js`):
  1. **Hero**: a clear value proposition, a live tree, the waitlist CTA and secondary "Log in", plus a theme toggle (the copy already promises one).
  2. **How it works**: one loop, Goal → Session → Evidence → Progress, using real component vignettes.
  3. **Explore an example**: the existing interactive FlowTree and read-only Goal Detail.
  4. **Features**: tabs. Goals & completion conditions (incl. SMART reviews, sequences, timeline heatmap) · Sessions (timers, sets, circuits, templates) · Programs · Notes & media · Analytics · Works offline. Fix the dead `extras` and "And more" paths so all content renders, or remove them.
  5. **Who it's for**: the existing audience cards.
  6. **FAQ**: pricing during beta, data ownership/export, offline, privacy.
  7. **Waitlist**: CTA and footer.
- **Mobile:** vertical, thumb-friendly; feature previews use purpose-built phone compositions (real components at real mobile size, using the Phase 4 work) instead of shrunken desktop frames, keeping "Explore full screen".
- **Performance/quality:**
  - Budgets: LCP < 2.5 s and CLS < 0.05 on throttled mobile, checked with a Lighthouse CI step in the browser workflow.
  - Lazy-load the feature tabs below the fold.
  - `prefers-reduced-motion` respected.
  - OG image regenerated.
  - `sitemap.xml` and meta copy updated.
- **Funnel:** the waitlist form stays (`publicApi.createBetaSignup`), and the success state says what happens next.
  - Check that `services/email_templates/beta_invite.py` links to `my.fractalgoals.com/?signup=1&invite_key=…&email=…`.
  - `AuthModal` opens straight into signup with the key and email filled in, and lands in the Phase 5 welcome flow.
  - The auth modal gets the landing's visual language.
- **e2e:** `client/e2e/landing.spec.js`, desktop and mobile. It covers section nav, the example tree interaction, feature tabs, waitlist submit (stubbed), and theme toggle, and adds the landing to the sweep manifest.

**Checkpoint 6:** a real-device review of the landing and the invite → onboarding journey.

---

## Critical files

- **Theme:** `client/src/design-tokens.css`, `contexts/ThemeContext.jsx`, `contexts/GoalLevelsContext.jsx`, `public/boot/shell.js`, `components/flowTree/flowTreeGraphUtils.js`, `FlowTree.css`, `components/analytics/ChartJSWrapper.jsx`, new `utils/themeColors.js`, `utils/themeSchedule.js`, `validators/auth.py`
- **Loading:** `components/common/LoadingState.jsx`, `AppRouter.jsx`, `utils/api/core.js`, `offline/connectivity.js`, `index.html`, `main.jsx`
- **Settings/Logs:** `components/modals/SettingsModal.jsx` → `components/settings/*`, `components/atoms/*`, `pages/Logs.jsx`, `hooks/useLogsData.js`, `services/log_service.py`, `blueprints/logs_api.py`
- **Mobile:** `components/atoms/Modal.jsx` and its CSS, `scripts/responsive-audit.mjs`, `scripts/maintainability-audit.mjs`, new `e2e/sweep/*`
- **Onboarding/Landing:** `pages/Selection.jsx`, `components/onboarding/*`, `services/_goal_fractals.py`, `pages/Landing.jsx`, `components/landing/*`, `content/landing.md`, `components/modals/AuthModal.jsx`

**Reuse rather than rebuild:**
- `useChartThemeDefaults`
- `utils/chartGrain.js` `bucketRows`
- `admin/DauBarChart.jsx` (pattern for the logs chart)
- `utils/localPreferences.js`
- `authApi.updatePreferences`
- `useFeatureFlags` / `isFeatureEnabled`
- `useIsMobile` / `useMediaQuery`
- `ResponsiveSidePane`
- `atoms/Input`, `Select`, `Checkbox`, `Button`
- `EmptyState`
- the existing invite-key validation and beta-invite email

## Verification (per phase)

- `./run-tests.sh all` and `./run-tests.sh lint` pass, including the new contrast check, colour and loading audit rules, and the theme-schedule fixture test shared with `shell.js`.
- New backend tests: logs activity buckets (timezone, DST, range limits, tenancy), quickstart fractal (idempotency, single transaction, quota), and `appearance` preference validation.
- New Vitest tests: `themeSchedule`, `themeColors` contrast, `useLoadEscalation` timing (fake timers), Settings tab gating by flag and connections, and the welcome flow.
- `npm run sweep` contact sheet reviewed at every checkpoint. Its CI assertions (overflow, tap targets, axe) are green.
- New e2e tests: `onboarding.spec.js`, `landing.spec.js`, and throttled cold-start escalation.
- Manual checks on a real device (iPhone Safari and desktop Chrome) at checkpoints 1, 4 and 6.
- `index.md` gets updated for the theme preference contract, the loading system, the sweep harness and the onboarding quickstart.

## Open item to confirm during execution
- Cloud Run `min-instances 1` for the beta: this costs money, so it needs your explicit go-ahead before `cloudbuild.yaml` is changed.

---

## Delivery log

### Phase 0 — Review harness (2026-11-11)

Delivered:
- `scripts/browser_showcase_seed.py`: a read-only "Play jazz guitar at a jam session" fractal (16 goals across 4 levels, 14 completed sessions with sets/metrics, a 2-block program, notes, 60 days of event history) owned by a separate admin user, `sweep_admin`, wired into `scripts/browser_test_server.py`.
- `client/e2e/sweep/` (`manifest.js`, `auth.setup.js`, `sweep.spec.js`): 21 surfaces × 4 viewports (360, 390, 768, 1440) × 2 themes = 168 captures, recording overflow, touch-target and axe findings per capture. Sweep projects exist only under `SWEEP=1`, so the workflow browser suite is unchanged.
- `client/scripts/run-sweep.mjs` (`npm run sweep [-- --no-build --grep <id>]`) and `client/scripts/sweep-report.mjs` → `client/sweep-results/index.html` (gitignored). `SWEEP_ENFORCE=1` turns findings into failures. CI enforcement is switched on at the end of Phase 4, once the baseline is clean.
- Fixed one bug the sweep exposed: `RequireAdmin` redirected while auth was still loading, so reloading or deep-linking `/<root>/logs` sent admins to Goals (tests in `src/__tests__/AppRouter.test.jsx`).

Baseline findings (all 168 captures):

| Finding | Count | Notes |
|---|---|---|
| Horizontal overflow | 0 | Overflow is contained in inner scroll areas rather than the page; check them visually |
| Touch targets < 24px | 845 (on touch viewports) | Settings (all tabs), Goals flow-tree controls, Notes, Session Detail, Programs |
| Touch targets < 40px | ~2,000 | Recommended size only: tracked, never failing |
| axe `color-contrast` (serious) | 76 light / 72 dark | Phase 1 contrast work |
| axe `meta-viewport` (moderate) | 114 | Zoom is disabled on some routes (`utils/viewportMeta.js`). Decide in Phase 4 |
| axe `select-name` / `label` (critical) | 23 / 15 | Settings and Logs fields without labels: Phase 3 |
| axe `scrollable-region-focusable`, `nested-interactive`, `aria-prohibited-attr`, `button-name` | 15 / 8 / 8 / 4 | Phase 4 triage |
| Logs on phones | broken | Fixed 4-column grid: each row is ~330px tall. Phase 3 |

### Phase 1 — Theme (2026-11-11, awaiting checkpoint review)

Delivered:
- **WinClassic light palette** (`client/src/design-tokens.css`). After the first review the surfaces were lifted toward VS Code WinClassic's #EFEFEF. They mirror the dark theme's structure: panels (elevated, sidebar, surface, card-alt) share #F5F5F4, cards are #FAFAF9, the canvas is #EDEDEC and the title bar is #E3E2DE. Inputs are the only pure white. Lines and borders are crisp and dark. Brand and status colours are WinClassic's: selection blue #0058D6, navy accent #0000A2, green #13802B, red #C5060B, amber #B85600. Shadows are short and neutral. Light overrides now cover brand, status, log, mode and heatmap colours, which previously had dark values in both themes.
- **Icon halos fixed by that structure.** `.sessionIconSlot::before` masks hierarchy connector lines in `--color-bg-elevated`. It vanished in dark only because every panel shared one tone, and now the light theme does the same.
- **Theme-aware goal colours.** `utils/themeColors.js` `adaptColorForTheme` darkens stored level and completion colours in OKLCH, keeping the hue, until they reach 4.5:1 on light cards. Colours that already read are untouched, and dark returns the stored colour. `GoalLevelsContext` applies it to `getGoalColor`/`getColorByName`, so every consumer, including flow-tree completed edges, is covered. The colour pickers keep editing the stored values. `ThemeProvider` moved above `GoalLevelsProvider`.
- **Flow tree.** Edge glows scale by `--flowtree-glow-strength` (1 in dark, 0.25 in light), and the light connecting line is #6B6862.
- **Charts.** New light `--chart-series-*` checked with the dataviz validator against #FAFAF9 (all checks pass). `--color-accent`, previously undefined, is now defined. `GoalCompletionTimeline` reads `useChartThemeDefaults` instead of hard-coded dark colours.
- **Hard-coded colours.** The dark-only literals in `SelectActivitiesModal`, the three error boundaries, `AnnotationLayer` and 17 CSS files are now tokens. That fixes, for example, Selection cards turning dark grey on hover in light mode. A new maintainability rule caps raw colour literals at a no-growth budget of 254 (down from 360).
- **Contrast gate.** `scripts/check-theme-contrast.mjs` (`npm run check:contrast`, in `./run-tests.sh lint` and frontend CI) checks 63 text/surface, line/canvas, focus-ring and button pairs across both themes. Focus rings are stronger in both themes to pass 3:1.
- **Theme modes and schedule.** `utils/themeSchedule.js` (System / Light / Dark / Scheduled, with device-local "dark from / light from" times). `ThemeContext` wakes at the next switch and re-checks on tab focus. Scheduled switches ease over 600ms, except under reduced motion. The preference is stored per device (`theme-preference`, migrating the legacy `theme` key) and synced to `user.preferences.appearance`: the account wins at sign-in, and an account without a saved choice adopts the device's. `public/boot/shell.js` resolves it before first paint. Both resolvers are tested against `tests/fixtures/theme_schedule_cases.json`. The backend validates `appearance` strictly (`AppearancePreferenceSchema`).
- **Settings.** `components/settings/AppearanceSettings.jsx` replaces the toggle button (four mode cards, plus time pickers for Scheduled). Phase 3 restyles the rest of Settings around it.
- **Sweep isolation.** Captures hide and drop the account appearance, so parallel light and dark runs under one account don't overwrite each other.

Found for later phases:
- Phase 2: Session Detail's Goal Hierarchy pane shows "No goals associated with this session" while its data is still loading (seen under parallel load), which is a misleading empty state.
- Phase 2: the Notes feed shows "No notes yet" while its first page is still loading (the heatmap already says 8 notes), the same empty-while-loading class of bug.
- The full Vitest run took 257s on this machine, over `run-vitest-with-timeout.mjs`'s 180s default. Check whether this is load or a regression before relying on the default.

#### Checkpoint 1, round 2 (2026-11-11)

- Icon halos removed rather than recoloured: the goal hierarchy masks a gap into its connector lines around each icon (SVG mask in `GoalHierarchyList`), and the notes timeline breaks its rail and session brackets around each node (`useTimelineLineGaps` sets `--line-mask`), so nodes have no fill or ring. Connector glows sit on a wrapper `<g>` so they are drawn from the masked line (a masked glow left a pale disc round each icon); light mode scales the glow by `--flowtree-glow-strength` and thins the highlight (`--tree-highlight-width` / `--tree-highlight-opacity`).
- Light-mode goal colours now target 3:1 (WCAG 1.4.11 non-text) instead of 4.5:1, and yellows ease toward gold as they darken (`#ffd700` → `#bc8600` instead of olive `#887200`).
- Segmented toggles (`ViewToggleTabs`) read their track and selected-segment edge from `--color-toggle-*` / `--shadow-toggle-thumb`; light mode gets a darker track and a lifted, outlined thumb. New `size="compact"` and `semantics="radio"`.
- Theme setting uses the compact toggle; Settings section titles, tabs and option labels are smaller.

### Phase 3 — Settings and Logs (2026-11-11)

Phase 2 (loading) was skipped by mistake (I read "proceed to phase 3" as a skip); it runs next, before Phase 4.

**Settings**
- `SettingsModal.jsx` is now a shell over `components/settings/` sections: `GeneralSettings` (Regional, Appearance, This fractal), `AppearanceSettings`, `AccountSettings`, plus the existing goal characteristics, AI, storage and onboarding panels.
- New primitives: `SettingsSection` / `SettingsRow` (label and help on the left, control in a fixed column on the right, stacking on phones), `atoms/Switch` (`role="switch"`), and shared field styles in `SettingsControls.module.css`.
- Every field has a real label; Account forms use `atoms/Input` and `atoms/Button` with autocomplete hints.
- Navigation: a vertical ARIA tablist with arrow keys and Home/End on desktop; on phones, a section list that drills into one section with an "All settings" back button. `?settings=` deep links open the section directly on both.
- AI Connections is hidden unless `ai_agent_connectors` or `ai_agent_embedded` is on, or the user still has a connection (so it can be revoked).
- Tests: `SettingsModal.test.jsx` (7: gating, deep links, keyboard, drill-in) and `Switch.test.jsx` (2).

**Logs**
- Backend: `GET /api/<root>/logs/activity` buckets events per local day or hour by domain (Goals, Sessions, Activities, Programs, Notes, Other). The list endpoint takes the same `tz`, so a chart day and the table agree, and each log carries its `domain`. Tests cover the local-day boundary, DST (23- and 24-bucket days), the event-type filter, validation and tenant isolation (29 pass).
- Client: `components/logs/` (`LogsActivityChart`, `LogsList`, `logsRange`, `Logs.module.css`); `pages/Logs.css` is deleted. The page uses the shared `PageHeader`; the red Clear logs uses a new `HeaderButton` `danger` variant.
- One filter row drives both chart and table: 7 / 30 / 90 days / Custom, plus event type. Clicking a chart day narrows the table to that day.
- The chart is a stacked bar per domain, with fixed colours from the validated chart series, a legend, a tooltip with totals, and a note in place of an empty chart.
- The table shows relative time over exact time, a domain marker, and the event type. Entity ID and an expandable payload sit under the description. The source wraps after its dots. Below 1024px the source moves under the description; on phones each event is a card.
- The contrast gate now also checks text on dark-mode danger buttons (64 pairs).

#### Checkpoint 3, round 2 (2026-11-11)

- Logs: the shared `PageHeader`, a red `HeaderButton` `danger` Clear logs, the full source wrapping after its dots (under the description below 1024px), and the ID and payload stacked under the description.
- Settings: every tab's sections use `SettingsSection`. The rule sits right under the title, and a description sits 10px below it (measured on every tab). The storage and AI panels' paragraph resets use zero-specificity `:where()` so they can't override that spacing.
- Cloud Storage: one type scale (13px body, 12px detail) and small buttons.
- Goal Characteristics: one collapsible panel per level, grouped into Appearance, Rules (switches), Deadlines, Children and Reviews. Save and Restore sit at the foot, and "Unsaved changes" shows in the header. Completed goals come last.
- Account: the plan is one row; usage is a two-column list with meters only for real limits (red at 90%), and the scope options are compact chips. Fixed a double usage fetch on open: loading fractals always produced a new scope array.
- The dialog keeps a fixed height across tabs.
- Test server: the browser fixture server's DB pool is 20 + 20, because four parallel sweep browsers exhausted the default 5 + 10.

### Phase 2 — One loading system (2026-11-11)

- `LoadingState` is the single loading component: a 200 ms anti-flash delay, then a spinner or a content-shaped skeleton (`list`, `cards`, `chart`, `detail`, `tree`). After 4 s it adds "Still loading…", or a "server may be waking up" line when API reads are slow. With `error` it shows a retry. `useLoadEscalation` drives the stages.
- Cold starts: `offline/serverWarmth.js` counts GET requests waiting over 2.5 s. When a request times out, the reachability probe now waits 30 s instead of 5 s, so a cold start no longer flips the app to Offline. Cloud Run config is untouched.
- App-host boot loader: `index.html` shows the same look before the bundle loads, with the waking hint after 4 s, and hands off when React shows something (with a 1.5 s fallback so it can never stick).
- Migrated: 17 route fallbacks (to `RouteFallback`), around 50 ad-hoc loaders across pages, panels, admin and modals, and `ChartLoading` / `AnalyticsLoading`, which now delegate. Fixed the `Sessions` quick-session `message=` prop bug (it showed a generic "Loading…").
- Empty-while-loading fixed: Notes shows a skeleton until its first page arrives; Session Detail's goals panel waits for `sessionGoalsViewLoading` before saying "No goals associated"; Program Day Picker shows loading instead of "No program days".
- Gate: the maintainability audit fails on a `div`, `p`, `span`, `li` or `section` that just says "Loading…", and on `.loading-spinner`.
- Verified with a simulated cold start (5 s bundle, 7 s API): boot loader, then the waking hint, then the Notes skeleton.

### Test speed (2026-11-11)

Measured first (full Vitest run, summed across workers): about 270 s building jsdom per file, about 340 s importing modules, and about 170 s of actual tests. The browser suite took about 15 minutes, with every test signing in through the form against one dev-server process. The machine was also at load 13–33, mostly from other apps.
- Vitest: 125 logic-only files run in the `node` environment (docblock); the setup lazy-loads the DOM helpers. Related runs (the pre-commit hook) use the full worker count, and the wall-clock limit is now 8 minutes; the 180 s limit cut off two commits today.
- Browser suite: one sign-in per run (a `setup` project and saved storage state, plus the API token for seeding specs). Gunicorn serves it with 3 workers and a 75 s keep-alive. Assertions wait 10 s instead of 5 s. `test:browser:smoke` covers 9 key journeys on desktop.
- Server fixes found along the way: workers must not inherit the parent's DB connections (requests hung), and only the owning process may drop the test database (a worker exiting through the inherited `finally` dropped it mid-run).
- Product finding: `GET /api/fractals` takes about 0.8 s even idle for a user with many fractals (Selection page). Profile it as a performance follow-up.

### Phase 4 — Mobile pass (2026-11-11)

Result: the full sweep (169 captures, 4 viewports × 2 themes) has no overflow, no tap targets under 24px and no serious axe violations. The baseline had 845 small targets and about 340 contrast failures.

- **Sweep accuracy.** Checks are scoped to an open modal (the page behind it is inert). A checkbox inside its label is measured by the label. Goal-tree nodes are exempt, since they sit on a pinch-zoom canvas. `/landing-preview` is served by the fixture server; the landing capture had been a 404 since Phase 0.
- **Touch.** A `--touch-target` token. Coarse-pointer sizes for icon toggles, note menus, set reorder/remove, switches, calendar pills, auth and setup links. Inline text buttons grow their tap area with padding plus a negative margin. Hover-only controls (Selection delete, note actions, associator remove, tag options) stay visible without hover. 16px fields on phones stop iOS zoom.
- **Structure.** Selection cards use a stretched title button instead of a role=button card containing the delete button. Flow-tree edges are no longer focusable. Status badges have `role="img"`. The Analytics icon buttons are named. Session Detail's start/stop/duration fields stack below 480px.
- **Colour.** `useReadableColor` adapts user colours per role (marks 3:1, text 4.5:1 against the light canvas, tinted text 5.5:1). Dark mode now lightens colours too dark for dark surfaces. Calendar day numbers, block labels and due prefixes, and the program block titles, mix the stored colour toward the ink. Primary buttons and Add Session use inverse text in dark mode. Coloured status text on its own tint uses ink.
- **Reverted at your request.** The two-row phone header and wrapping header actions: page headers, the goal footer and the goal date row pan sideways again (the date row is now focusable). Modals stay centred modals; `Modal mobilePresentation="sheet" | "fullscreen"` is available as an opt-in, but nothing uses it yet.
- **CI.** `.github/workflows/visual-sweep.yml` runs beside Frontend CI. `sweep:quick` (phone + desktop, both themes, 84 captures, ~3 min) runs on PRs that touch the client; the full sweep runs nightly and on demand. Captures retry once.

Found for later:
- Each animated goal icon renders its own `<style>` block (visible as `@keyframes` text in flow-tree nodes).
- `GET /api/fractals` takes about 0.8 s for a user with many fractals.
- Loading is spinner-only (your call): the skeleton variant and `LoadingSkeleton` are removed, so the boot loader, route changes and data loads all show the same spinner.
- Phones open the goal hierarchy fitted: after the first draw, the view is refitted to what is actually drawn (text, icons and connector lines, which phones wrap differently from the layout's node sizes). The tree is centred, sits below the options pane and program label, never exceeds 100% zoom, and is checked at 320×568 up to 430×932 (`flowTree/flowTreeViewport.js` `fitViewportToDrawn`).

### Phase 5 — Onboarding (2026-11-11)

- **Welcome flow.** A user with no fractals lands on a three-step flow instead of the empty Selection grid: what a fractal is (with a sample tree), the big goal (tap-to-fill examples), and up to three long-term goals with a live tree preview. Each step moves focus to its heading. Enter advances. Full screen on phones. "I’ll set it up myself" is remembered per user and opens the existing create modal. It is suppressed while an invite or sign-up dialog is open.
- **One request.** `POST /api/fractals/quickstart` creates the fractal, its levels, onboarding state, starter template and the long-term goals in one transaction. It is `@idempotent` (the flow sends one key per visit, so a retried tap never makes two trees), rate limited to 5/min, and checks the goals quota for the whole tree before writing anything. `create_fractal` now shares `_build_fractal` with it. 7 integration tests: children, no children, replay, validation, quota rollback.
- **Checklist.** Steps re-sequenced and reworded: Explore your goal tree → Create an activity → Run your first session → Make one goal SMART → Plan a program. The compact view's "Go" is now "Show me" (deep link plus details). On phones it sits above the page footer. Finishing every step shows a one-off "You’re all set up" celebration (only on the transition, never for accounts that were already complete).
- **Empty states.** Quick sessions with no activities and the Sessions list now say what goes there and how to start.
- **e2e.** `client/e2e/onboarding.spec.js` signs in as a fresh account on desktop and phone, walks the flow by keyboard and click, checks the tree on the Goals page, and that Selection then shows the new fractal with no welcome and no overflow.
- **Also fixed.** `_skipWarmth` (Phase 2) was missing from the axios config type, so `npm run typecheck` had been failing; it's now declared in `src/types/axios.d.ts`.

Still to do by you: turn on `onboarding_v1` in Admin → Feature flags for the beta. The code default stays off, so self-hosted and test environments are unchanged.

Not done from the plan: the invite → sign-up leg of the e2e (that belongs to Phase 6's funnel work), and the checklist's phone pill-to-sheet (it stays a compact floating card above the footer).

### Phase 6 — Landing page and funnel (2026-11-11)

> Superseded before commit by the live-demo redesign: see `planning/landing-live-demo-2026-11.md`. The `main.jsx` preload fix, theme toggle, sign-up auto-login, invite fixture keys and meta/OG copy below carry over; the multi-section page does not.

- **One vertical page.** The desktop wheel-hijacked horizontal snap is gone (`landingScrollNavigation` deleted). Every width scrolls natively with a sticky header and scroll-spy; examples and features stay full-height app windows on wide screens. Section jumps land just below the header.
- **Narrative.** New sections: How it works (goal → session → evidence → progress), And more (the previously dead "Feature Extras" and "More" copy, refreshed: completion conditions, SMART reviews, goal timelines and heatmap, notes with media, progress comparisons, themes) and FAQ (access, not a coach, phones and offline, data export, not only fitness). Hero: "Private beta" kicker plus Request access / Log in on every width (desktop had no call to action). Copy, SEO, static meta and the OG image updated.
- **Theme toggle** in the header (light/dark for the device; Settings keeps the schedule modes).
- **Boot copy.** `index.html`'s first-paint copy matched an old palette and nav; it now mirrors the new hero in both themes, and an architecture test ties its wording to landing.md.
- **Fixed: the public landing never loaded its own CSS.** `main.jsx` chose the root with a ternary of two dynamic imports; the minifier folded them into one preload carrying AuthenticatedRoot's dependencies, so the landing (a) downloaded the authenticated shell's chunks and (b) only got its stylesheet by accident, when the features section's lazy chunk loaded. The boot copy stayed up until then. Split into two statements: the hand-off now happens in ~0.25 s and the landing no longer preloads the app shell.
- **Funnel.** Signing up from an invite link now logs straight in (with the password just chosen; falls back to the login form if that fails) and lands in the Phase 5 welcome flow, instead of asking for the password again.
- **e2e.** `client/e2e/landing.spec.js` (desktop and phone): section nav, tree unlock / full-screen explorer, feature tabs, FAQ, stubbed waitlist submit, theme toggle, no overflow; and invite link → prefilled sign-up → welcome flow (fixture invite keys `browser-invite-<project>`). Both new specs joined `test:browser:smoke`.

Not done from the plan:
- Lighthouse CI budgets (LCP/CLS) — not added, to keep CI time down; worth a one-off local run before launch.
- Purpose-built phone compositions for the feature previews; they remain scaled desktop frames with "Explore full screen".
- Restyling the auth modal in the landing's visual language.
- FAQ has no pricing answer: there's nothing in the product to base one on, so that copy needs to come from you.

