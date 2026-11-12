# Landing → Live Demo: one hero page, the real app as the demo, a guided walkthrough

Branch: `feat/beta-launch-polish` · On approval, save as `planning/landing-live-demo-2026-11.md` and replace Phase 6 in `planning/beta-launch-polish-2026-11.md` with a pointer to it.

## Context

The landing page explains the product in seven sections of copy and scaled-down previews. You want to cut to the chase: one hero page whose call to action is **Demo**, with the example fractals' root icons beneath it. Clicking an icon opens the real application, fully featured, on that example, and a guide panel (the onboarding modal, repurposed) walks the visitor through the features. From the panel they can switch examples at any time and sign up through a light modal.

Decisions made:
- **The demo is read-only and runs the real app against the real API.** A client-side mock of ~300 endpoints would drift from the real thing immediately. Saving shows a friendly "Sign up to do this" prompt. It's built so that a per-visitor writable sandbox can be added later.
- **Sign up = waitlist, and an invite key unlocks it.** The modal collects email plus an optional goal. "Have an invite key?" sends the visitor to the app host's invite link, which already pre-fills sign-up, logs them straight in and lands them in the welcome flow. Cookies are host-only, since `/api` is same-origin on each host, so the account has to be created on `my.`

The current Phase 6 work (uncommitted) is superseded. I keep the parts that still apply: the `main.jsx` preload fix, the boot-copy architecture test, the theme toggle, the auth-modal auto-login, the invite fixture keys and the OG/meta copy. I delete the rest.

---

## Current grade, for this goal (F → S)

| Area | Grade | Why |
|---|---|---|
| Landing as a demo | **D** | Visitors see snapshots, never the app. The previews are re-implementations (`LandingFeatureSession`, `LandingFeaturePrograms`, …) that drift from the real pages and cost ~3k lines to maintain. |
| Read-only access to another account's fractal | **B** | `token_required` already has an audited admin `read_only` support mode (`blueprints/auth_api.py:180-224`), and the client already forwards it (`utils/api/core.js:133`) and shows a banner (`AppRouter.jsx:251`). But it's admin-only, keyed on query params, and enforced by method rather than a route allow-list, so it isn't safe to expose publicly as is. |
| Guided walkthrough | **D** | There are no tour or spotlight primitives. `GettingStartedChecklist` is a static step list with "Show me" links. |
| Sign-up funnel | **B** | The waitlist form, invite links, prefilled sign-up, auto-login and welcome flow all work. They're just not reachable from a demo. |
| Demo data safety | **C** | Landing examples can be any user's fractal (`_landing_settings.py:148`). The snapshot strips private media (`omit_private_media`), but a live demo would read the owner's live data with no equivalent boundary. |
| **Overall** | **C** | Good parts exist (read-only mode, published examples, showcase picks, funnel). They need joining up behind a deliberate public security boundary. |

## What S+ looks like

- **A public, fail-closed demo boundary.** A short-lived signed demo token works only on published example roots, only on an explicit allow-list of read endpoints, and never on media the snapshot would hide. A test walks every route in the Flask URL map to prove nothing else is reachable.
- **The demo is the real app, not a copy.** It uses the same routes, pages and components through a shared route table under `basename="/demo"`, so every product improvement shows up in the demo automatically.
- **Writes are intercepted before the network**, with one friendly prompt, no error toasts and no offline outbox. Nothing ever reaches the server.
- **A guide that teaches through the real UI:** spotlighted steps on real elements, deep-linked to the most impressive data via the admin's existing showcase picks, an example switcher, sign-up always one tap away, and full screen on phones.
- **The landing is one fast hero.** It warms the API while the visitor reads, so the demo opens without waiting through a cold start.
- **End-to-end coverage of the whole journey** on desktop and phone, plus sweep coverage of the demo surfaces.

---

## Phase A: Demo access boundary (backend)

- **New `services/demo_access_service.py`:**
  - `issue_demo_token()` returns a JWT signed with the existing secret, containing `{typ: 'demo', roots: [...], exp: now + 2h}`.
  - Allowed roots = the published landing examples (`LANDING_EXAMPLE_SETTINGS_KEY` via `_LandingSettingsMixin`), cached briefly.
  - `resolve_demo_root(token, root_id)` returns the root's owner id, or a 404 if the root isn't allowed.
- **New `POST /api/public/demo-session`** in the public blueprint. Limited to `30 per minute` per IP. Returns `{token, expires_at, roots: [root ids]}`, and makes no database writes.
- **`token_required` (`blueprints/auth_api.py`):**
  - Branch on demo tokens before the user lookup.
  - Factor the existing support-mode swap into one `_grant_root_read_access(owner_id, mode)` helper used by both paths.
  - A demo request must:
    - be safe (`GET`/`HEAD`), or an allow-listed read-POST such as `/api/analytics/query/run`;
    - hit an endpoint in **`DEMO_READ_ENDPOINTS`**, an explicit set of Flask endpoint names (fail closed);
    - target an allowed `root_id`.
  - It then runs as the root's owner with `g.access_mode = 'demo'`.
  - No audit row per request (it's public and high volume); one ops log line per token issued.
- **App-shell reads outside a root:**
  - `/api/fractals`: when `g.access_mode == 'demo'`, return only the demo roots.
  - `/api/goal-levels?root_id=`
  - `/api/feature-flags`
  - The exact list comes from step 1 of Phase B, which records every request the demo makes.
- **Media:** the media stream and URL endpoints honour the same rule as the snapshot (`services/media_stream.py` `omit_private_media`). In demo mode, private media returns 404 and the UI shows its existing missing-media state.
- **Blocked outright, so they're never in the allow-list:** account, settings writes, storage, agents/AI, logs, admin, export, telemetry writes.
- **Tests: `tests/integration/test_demo_access.py`:**
  - A parametrised **route matrix** over `app.url_map`:
    - every mutating rule rejects a demo token (403);
    - every rule outside the allow-list rejects it;
    - allow-listed reads succeed for a demo root and return 404 for a non-demo root.
  - Expired and tampered tokens return 401.
  - A demo token can't use the `admin_mode` params.
  - Private media is hidden.
  - The fractal list is scoped to the demo roots.

## Phase B: The real app on the landing host, read-only

1. **Shared route table.** Extract the `/:rootId/...` routes from `AppRouter.jsx` (lines ~289-380) into `src/FractalRoutes.jsx`, used by both `AppRouter` and the demo. This is a behaviour-preserving refactor and the existing AppRouter tests must pass.
2. **Entry.**
   - `utils/marketingHost.js` gains `isDemoLocation()`: `/demo/*` on the marketing host, and `/demo/*` on localhost for development and tests.
   - `main.jsx` gets a third separate-statement branch, `import('./DemoRoot')`. It keeps the preload fix (separate statements, not a ternary).
3. **`src/DemoRoot.jsx`:**
   - `QueryClientProvider` with an **in-memory** cache (no persisted cache).
   - `BrowserRouter basename="/demo"`, so every existing `navigate('/${rootId}/goals')` stays inside the demo untouched.
   - `ApplicationProviders`, with offline sync and the outbox disabled in demo mode.
   - `DemoAuthProvider`, `FractalRoutes`, `DemoGuide`.
4. **`DemoAuthProvider`** (in `contexts/AuthContext.jsx`, next to `AuthProvider`, same context value shape):
   - A synthetic user (`{ id: 'demo', username: 'Guest', preferences: {} }`) with `isDemo: true`.
   - Mints the demo token through `publicApi.createDemoSession` and sets it with the existing `setAccessToken`.
   - On a 401 it re-mints instead of calling `/auth/refresh`.
   - Logout means leaving the demo for the landing page.
5. **Write interception (`utils/api/core.js`):**
   - A request interceptor active in demo mode rejects mutating requests (except the allow-listed read-POSTs) **before sending**, with `DemoReadOnlyError`, and dispatches `demo:write_blocked`.
   - The notification layer ignores that error, so there are no error toasts.
   - **`DemoWritePrompt`** (a small `atoms/Modal` card): "This is a live demo, so changes aren't saved. Sign up to build your own." Its buttons are Sign up and Keep exploring. It's rate-limited to one prompt per action burst.
6. **Demo chrome:**
   - `NavigationHeader`: the fractal switcher lists the examples; Admin, Logs, AI and account settings are hidden; Log out becomes **Exit demo**.
   - Settings opens with Appearance only.
   - The existing admin read-only banner pattern (`AppRouter.module.css .adminModeBanner`) is not used; the guide is the demo's indicator.

## Phase C: Guided walkthrough (the onboarding panel doubles as the tour)

- **`components/demo/DemoGuide.jsx` + `.module.css`:**
  - Reuses `GettingStartedChecklist`'s visual language: a floating card on desktop, and on phones a bottom sheet that collapses to a pill above `MobilePageFooter`.
  - It contains:
    - an **example switcher** (root icons from the snapshot, `getGoalIconProps`); switching keeps the current tour step and page;
    - the **tour step list** with progress;
    - Back/Next;
    - **Sign up**;
    - **Exit demo**.
  - Keyboard: arrows move between steps, Esc collapses.
  - Remembers the collapsed state and current step per visitor (`localPreferences`).
- **`components/demo/demoTour.js`** defines the steps in order. Each step names a route, a `data-tour` anchor, and copy written for both themes. Example-specific deep links come from the admin's existing **showcase picks** (the snapshot's `showcase` field; `landingFeatureModel.js` `resolveFeatured*` is reused and moved to `components/demo/`). The steps:
  1. Your goal tree
  2. A goal's details, timeline and completion
  3. Sessions log
  4. Inside a session (activities, sets, timers)
  5. Activities and metrics
  6. Programs calendar
  7. Analytics
  8. Notes
  9. "Make it yours", which leads into Sign up
- **`components/demo/Spotlight.jsx`:**
  - A dim overlay with a cut-out around the anchor (it measures with a `ResizeObserver` and re-measures on route change and scroll) and a popover next to it.
  - `aria-live` step announcements, focus moved to the popover, reduced motion respected.
  - If an anchor is missing, the step shows the popover centred.
  - About 8 `data-tour` attributes are added to existing elements, for example:
    - the FlowTree canvas
    - GoalDetail
    - the Sessions list
    - SessionDetail's activity list
    - the ManageActivities grid
    - the Programs calendar
    - the Analytics view
    - the Notes timeline
- **`components/demo/DemoSignupModal.jsx`** (light `atoms/Modal` card):
  - Email plus an optional "What goal are you working towards?", sent through `publicApi.createBetaSignup`. The success copy says what happens next (reusing the landing.md strings).
  - "Have an invite key?" expands to key and email, then navigates to the app host's invite link (`https://my.fractalgoals.com/?invite_key=…&email=…`, or `/` locally). That path already logs the new user straight in and lands them in the welcome flow.

## Phase D: The landing page becomes one hero

- **`pages/Landing.jsx`** keeps the header (brand, theme toggle, a small **Log in** link for existing users), then the kicker, H1 and body. Then:
  - a **Try the live demo** label with the example root icons beneath it, reusing the current hero picker markup (`exampleToggle`); hovering an icon still previews the root name in the H1;
  - clicking an icon goes to `/demo/<rootId>/goals?tour=1`;
  - a quiet "or join the waitlist" link opens `DemoSignupModal`;
  - the footer legal links.
- **Warm-up:** when the landing loads, fire `GET /api/healthz`. On icon hover or focus, prefetch the `DemoRoot` chunk and mint the demo session, so the click lands on a warm server. The existing `LoadingState` waking-server hint covers a true cold start.
- **Delete** the sections and their components and tests:
  - How it works, Examples explorer, Features, More, FAQ, Beta
  - `LandingFeature*`, `LandingFeaturesSection`, `LandingExplorerTakeover`, `LandingTakeoverShell`, `LandingAppFrame`, `LandingActivityCatalogue`, `LandingGoalCards`, `LandingExampleRail`, most of `LandingSections` (keep `LandingThemeToggle`)
  - the matching hooks and utilities once unused (`useDeferredSection`, `useActiveLandingSection`, `landingGoalDemos`, …)
- `content/landing.md` and `landingFallback.js` are trimmed to SEO, header, hero, demo, waitlist and footer.
- `index.html`'s boot copy is simplified to the new hero (the architecture test keeps it in step with landing.md).
- `responsive-audit.mjs`'s landing rules are rewritten.
- **Admin** keeps landing example publishing and showcase picks, which now drive the demo's root list and tour deep links. Admin copy is updated to say they feed the live demo. Recommendation (not code): keep the examples in a dedicated demo account so the demo never shows a real person's account.

## Phase E: Verification, sweep, docs

- **Backend:**
  - `pytest tests/integration/test_demo_access.py` (route matrix);
  - the full backend suite.
- **Vitest:**
  - the write-guard interceptor (blocked methods, allow-list, the event, toast suppression);
  - `DemoAuthProvider` (mint and re-mint on 401);
  - `DemoGuide` (switch example keeps step, keyboard, collapse);
  - `Spotlight` (missing anchor, reduced motion);
  - `DemoSignupModal` (waitlist submit, invite hand-off URL);
  - the slimmed Landing.
- **New `client/e2e/demo.spec.js`** (desktop and phone), which:
  1. starts on the landing page and clicks an example icon;
  2. lands on the real Goals page with the guide open;
  3. steps through all tour steps, checking the URL and spotlight for each;
  4. switches examples mid-tour;
  5. tries a write (create a goal), sees the prompt and confirms no POST left the browser;
  6. signs up for the waitlist (stubbed);
  7. follows "Have an invite key?" to the invite link → welcome flow, reusing the fixture keys;
  8. confirms no horizontal overflow and no page errors.

  `landing.spec.js` is rewritten for the one-page hero.
- **Sweep:** add `demo-goals`, `demo-session`, `demo-guide-open`, `demo-signup` and `landing` to `e2e/sweep/manifest.js` (demo auth through the fixture's published examples; the browser test server seeds a landing example setting).
- Update `index.md` (the demo boundary contract, `FractalRoutes`, demo mode) and the planning doc's delivery log.

**Checkpoints:** after B (browse the demo yourself), after C (tour copy and feel), after D (the landing page). Then a real-device pass.

## Critical files

- **Backend:** `blueprints/auth_api.py` (`token_required`), the public blueprint (demo-session route), new `services/demo_access_service.py`, `services/_landing_settings.py` (allowed roots), `services/media_stream.py`, the `/api/fractals` handler in `blueprints/goals_api.py`, `scripts/browser_test_server.py` (seed a published example).
- **Client:**
  - `src/main.jsx`, `utils/marketingHost.js`, new `DemoRoot.jsx` and `FractalRoutes.jsx`, `AppRouter.jsx`, `contexts/AuthContext.jsx`
  - `utils/api/core.js`, `utils/api/publicApi.js`, `components/layout/NavigationHeader.jsx`
  - new `components/demo/*`
  - `pages/Landing.jsx` and its CSS, `content/landing.md`, `index.html`

## Reuse

- The admin `read_only` swap (`auth_api.py:180-224`)
- `setAccessToken` and the interceptors (`utils/api/core.js`)
- `GettingStartedChecklist` styles
- `atoms/Modal`
- `getGoalIconProps` and the snapshot fetch (`utils/landingPrefetch.js`)
- showcase picks (`landingFeatureModel.js`)
- `publicApi.createBetaSignup`
- the invite-link → auto-login → welcome flow (built in Phases 5–6)
- `LoadingState`'s waking hint
- `localPreferences`
- `useIsMobile`

## Open item

- Cloud Run `min-instances 1` (still needs your go-ahead). A live demo makes cold starts visible to every first visitor; warming the API on landing load hides most of them, but not all.

---

## Delivery log (2026-11-11)

All five phases delivered. Status per plan item:

- **A. Boundary:** done as planned. Demo JWTs use audience `fractal:demo` and are re-checked against the *published* set on every request, so unpublishing closes access immediately. 72 root reads plus 3 shell reads (`/api/fractals` scoped to the demo roots, goal levels, feature flags) are allowed; everything else returns 403 `demo_read_only`. **Media:** stricter than planned. Instead of the snapshot's private-media rule, the demo serves no media at all; storage and attachment queries are skipped client-side. 11 integration tests: a route matrix over 300+ protected route×method pairs (writes and unlisted reads refused, listed reads 404 on unpublished roots, no rows written), cross-root ID probes, expired/forged tokens, admin-mode params, unpublishing.
- **B. Real app on `/demo`:** done. `FractalRoutes.jsx` is shared with `AppRouter`; `main.jsx` has a third root branch. Write guard plus muted failure toasts plus `DemoWritePrompt`. Header: no Settings or Ask AI; Exit returns to the landing.
- **C. Guide:** done. Nine steps, example switcher (keeps the step), Back/Next/keyboard/Esc, a pill when minimised with Sign up, bottom-left on desktop (side panels and their footers are on the right), compact above the page footer on phones, above the app's own modals (portal plus z-index) so the tour can walk through them. `Spotlight` rings the anchor without blocking clicks; the first click on the page clears it.
- **D. Landing:** done. ~3k lines of landing previews and their hooks and tests deleted; `landing.md` trimmed to SEO, header, hero, demo, waitlist and footer. The parser lost its section-specific code and gained a fix: the footer `Note` key was never mapped, so its copy had always come from the fallback.
- **E. Verification:** `e2e/demo.spec.js` (full tour, example switch, blocked save with no request leaving the browser, waitlist, invite hand-off, no 401/403, dark-theme visitor never prompted) and the rewritten `landing.spec.js`, both on desktop and phone and both in the smoke set. Sweep surfaces added: `landing-waitlist`, `demo-goals`, `demo-session`, `demo-signup`.

Found and fixed along the way:
- Theme sync treated the demo guest as an account and tried to save the theme, which popped the write prompt for any visitor with a non-default theme. Theme sync now treats the guest as signed out (unit and e2e regression).
- The sign-up modal kept its success state when reopened; it is now mounted per opening.

Follow-ups (2026-11-12):
- **One screen on desktop.** Hero type and spacing are capped by viewport height as well as width (`min(vw, vh)`), so header, hero, demo picker and footer fit without scrolling from 1280×720 to 1920×1080. The `index.html` boot shell mirrors the new sizes.
- **Examples keep their owner's look.** `GoalLevelsProvider` read the root from `window.location`, which under `/demo/<root>` never matched, so the demo got the owner's account-wide default levels instead of the fractal's own colours and icons. It now reads the router's path. The demo session also carries each example owner's two completed-goal colour preferences (nothing else from their preferences), applied for the fractal being viewed.
- Admin's Landing Examples intro now says the examples are the live demo.

Not done / for later:
- **Admin still edits content the new landing no longer shows.** The per-example "Landing page content" panel (goal bullets, tree-view defaults, featured activity and analytics views) fed the deleted landing sections; only the featured session and program are used by the tour. The goal bullets still count as "issues blocking publish", so publishing requires filling in text nobody sees.
- The test fixture's two examples share one root icon (they use the same seeded level); production examples have their own.
- "+ Add child goal" and similar affordances stay visible in the demo and lead to the write prompt on save (intended: visitors see what's possible). A later per-visitor sandbox would make them work.
- Cloud Run `min-instances 1` is still awaiting your approval; the landing warms the API (`/healthz` on load, a demo session on hover).

