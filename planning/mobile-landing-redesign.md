# Mobile Redesign of the Public Landing Page

## Context

The public landing page (`client/src/pages/Landing.jsx`) was designed desktop-first: at ≥981px it is a polished horizontal snap-section experience (hero → goals explorer → features → beta). Below 981px it degrades to the same DOM stacked vertically with only shrink rules, and the result on a phone is visibly broken (user screenshots):

- The header nav wraps into a second row of plain text links; nothing is sticky; no CTA emphasis.
- The hero example picker renders unlabeled 86px goal icons that read as random floating shapes (labels are `visually-hidden`).
- The goals explorer drops the full desktop FlowTree + `FlowTreeOptionsPane` into a 520px box; the bottom example rail (`LandingExampleRail`) is desktop-only (`display:none` <981px), so there is **no example switcher at all on mobile** past the hero.
- The features section stacks 4 full-width tab buttons, then 5+ detail cards, then a **desktop app surface** (session screen 620px min-height, program preview 760px min-height, activity builder modal) crushed into a ~390px column.
- The beta section stacks 4 audience cards + the form into another long wall.

Goal: a modern, intentional mobile design (<981px) that keeps the site's core promise — *real product surfaces running on real published data* — without pretending a desktop app fits a phone column. Desktop (≥981px) stays untouched.

Decisions confirmed with the user:
1. **Goals explorer** → inline locked auto-fit live tree preview + swipeable demo chips, with an **"Explore full screen" takeover** hosting the fully interactive FlowTree.
2. **Feature previews** → real components rendered at desktop width inside a **scaled "app window" frame** (non-interactive), each with a **"View full screen" takeover**.
3. **Navigation** → compact **sticky top bar (brand + Open app CTA)** plus a horizontally scrollable **scroll-spy pill rail** (Goals / Features / Private beta).

## Grade of the Existing Implementation (per CLAUDE.md)

| Area | Grade | Notes |
|---|---|---|
| Desktop landing experience | A | Deliberate, performant, snapshot-driven; snap navigation, deferred loading, boot shell. |
| Mobile layout & hierarchy | D− | Desktop DOM stacked; broken previews; unlabeled hero icons; 760px-tall crushed surfaces. |
| Mobile navigation | F | No sticky nav, no section affordance, no example switcher past the hero. |
| Mobile interaction model | D | ReactFlow pan/zoom vs page scroll mitigated only by tap-to-unlock; desktop modals at phone width. |
| Engineering foundation to build on | S | Everything needed exists: snapshot read model, lazy sections, `useIsMobile`, canonical `Modal`, design tokens, `--app-viewport-height`, strict perf budget. |

Overall mobile: **D**. The plan below targets **S+**: a mobile experience that is designed (not shrunk), touch-native, keeps live real-data demos via full-screen takeovers, respects the 175 kB gzip JS / 20 kB CSS entry budget, and stays in sync with the pre-React boot shell.

## Design Overview (applies <981px; 621–980px gets 2-column grids where noted)

```
┌─────────────────────────────┐
│ ✦ FRACTAL GOALS    [Open app]│ ← sticky bar
│ (Goals)(Features)(Beta)      │ ← scroll-spy pill rail
├─────────────────────────────┤
│ COMPOSABLE GOAL TRACKING     │ ← kicker eyebrow
│ Achieve Your Most            │
│ Ambitious Goals              │ ← tightened h1
│ Short explainer panel        │
│ [Request beta] [Open app →]  │ ← CTA row
├─────────────────────────────┤
│ See how real goals break     │
│ down…                        │
│ ‹ ◉Guitar ○Calisthenics … ›  │ ← labeled example chips (snap row)
│ ┌─────────────────────────┐ │
│ │ live tree, auto-fit,    │ │
│ │ locked   [⛶ Explore]    │ │ ← full-screen takeover
│ └─────────────────────────┘ │
│ ‹ Focus any goal ▸ demo ▸ › │ ← swipeable demo chips
├─────────────────────────────┤
│ THE FULL TOOLKIT             │
│ ‹(Sessions)(Activities)… ›   │ ← pill tabs (snap row)
│ Heading + body               │
│ ┌──── ○ ○ ○ app frame ────┐ │
│ │  scaled real UI (inert) │ │
│ │        [⛶ Full screen]  │ │ ← takeover
│ └─────────────────────────┘ │
│ ‹ detail card ▸ card ▸ …  › │ ← snap carousel
├─────────────────────────────┤
│ Private beta                 │
│ [email] [goal] [Request]     │ ← form first
│ Who it's for (compact cards) │
└─────────────────────────────┘
```

## Implementation

### 1. Mobile navigation — sticky bar + scroll-spy pill rail

- `Landing.jsx` header: keep one `<header>`; restructure with CSS so <981px it becomes `position: sticky; top: 0` (the vertical scroll container is the shared `.content-container`; sticky works inside it), two rows: brand + `Open app` link, and a pill rail built from the existing `landingContent.header.nav` internal items. Safe-area padding via `env(safe-area-inset-*)`. Frosted background (`color-mix` card + blur) so content scrolls under it.
- Extend `client/src/hooks/useActiveLandingSection.js` to support vertical mode: when the container scrolls vertically (<981px), report the section whose bounds cross the container's vertical midline (same rAF/scroll-listener pattern it already uses horizontally). `navigateToSection` already uses `scrollIntoView` (`block: 'nearest'` → use `block: 'start'` on mobile) — account for sticky header height with `scroll-margin-top` on sections.
- Pill styling mirrors the app's mobile horizontal nav rail idiom (stable tap targets ≥44px, momentum scroll, active pill uses brand underline/fill).

### 2. Hero

- Typography: kicker eyebrow (`landingContent.hero.kicker`, already parsed but unused on mobile), h1 down to `clamp(2.4rem, 9vw, 3rem)`, explainer panel tightened (smaller padding, `font-size-base`).
- Add the CTA row from `landingContent.hero.ctas` (already in `landing.md`: *Request beta access* → `#beta`, *Go to app*) — currently not rendered anywhere; render it on all widths ≤980px (desktop unchanged).
- Replace the unlabeled icon toggle (<981px) with **labeled example chips**: new shared component `LandingExampleSwitcher` (see §5) in a horizontal snap row — icon (36px) + root goal name, active state, tap selects + scrolls to `#examples`.
- Sync `client/index.html` boot shell: update the ≤620px/≤980px `.landing-boot-*` rules to mirror the new hero geometry (sticky two-row header footprint, h1 size, chip-row placeholder height replacing the 86px icon strip, CTA row reserve). Static CSS/HTML only — no behavior change to `landingBootHandoff.js`.

### 3. Goals section — inline preview + full-screen explorer takeover

- Inline (<981px): section header (compact), `LandingExampleSwitcher` chips, then the FlowTree canvas at `min(62svh, 560px)` full-bleed within page padding. The tree stays **permanently locked** inline on mobile (remove tap-to-unlock there): `interactionLocked` always true, `onNodeClick` disabled, options pane not rendered (`FlowTreeOptionsPane` hidden <981px). Overlay a centered `⛶ Explore full screen` button (bottom-right pill) on the canvas.
- The 4 demo cards (`LandingGoalCards`, keys `lineage / evidence / metrics / layout`) become a horizontal snap-scroll chip/card row under the canvas (edge-peek to signal swipeability). Activating one still runs `buildLandingGoalDemos` actions against the inline tree (visual demos work while locked since they only change `viewSettings`/scope).
- New lazy component `client/src/components/landing/LandingExplorerTakeover.jsx` (+ module CSS): a `position: fixed; inset: 0; height: 100dvh` overlay portaled to `document.body`, composing the canonical `Modal` primitives where practical (focus trap, Escape, reduced-motion) or replicating its behavior via `ModalBackdrop` conventions. Contents:
  - top bar: example name + close button; `LandingExampleSwitcher` chips beneath;
  - the same `FlowTree` stack fully interactive (pan/zoom enabled, `onNodeClick` → existing mobile path opens read-only `GoalDetailModal` `displayMode="modal"`), demo chips row, and view toggles (tree/hierarchy + the three checkboxes) as compact inline controls instead of the desktop options pane;
  - body scroll lock while open (the app pattern already exists via canonical Modal); state (selected example/goal/view settings) lifts from `Landing.jsx` so inline preview and takeover stay in sync.
- Keep `useDeferredSection` gating so FlowTree still loads lazily; takeover reuses the already-loaded chunk.

### 4. Features section — pill tabs, scaled app frame, card carousel

Files: `LandingFeaturesSection.jsx` / `.module.css`.

- Selector: <981px the `featureToggle` becomes a horizontal snap pill row (same pill idiom as nav rail), not 4 stacked buttons. Keep `warmFeature` on touch (`onPointerDown`).
- New component `client/src/components/landing/LandingAppFrame.jsx` (+ module CSS): renders children inside window chrome (traffic dots + `my.fractalgoals.com` label) at a fixed design width (`--frame-design-width`, ~1024px; 880px for the session screen), measured container width → `transform: scale(w/design)` with `transform-origin: top left` and wrapper height set from scaled content height (ResizeObserver). Scaled content is `inert`/`pointer-events: none; user-select: none`. A `⛶ View full screen` button overlays bottom-right.
- Full-screen preview takeover: a lightweight shared overlay (same shell as §3's takeover — extract a tiny `LandingTakeoverShell` used by both) that renders the **live** feature component at its design width inside an `overflow: auto` (both axes) scroller with momentum, plus a `Fit / 100%` zoom toggle. Interactive elements inside the previews (activity view tabs, program Calendar/Blocks toggle, analytics view picker) work here.
- Mobile stage uses `LandingAppFrame` for all four features; the per-feature `min-height: 620/760px` mobile rules in `LandingFeaturesSection.module.css` `@media (max-width: 980px/620px)` blocks are deleted (frame height derives from scale).
- Detail cards (`featureDetailGrid`): horizontal snap carousel <981px (one card ≈ 78vw with edge-peek); the Activities cards keep their `aria-pressed` view-switch behavior — switching a card updates both the framed stage and the takeover.
- Keep everything behind the existing `shouldRenderFeatures` deferral and lazy per-feature chunks.

### 5. Example switcher everywhere — `LandingExampleSwitcher`

- New component `client/src/components/landing/LandingExampleSwitcher.jsx` (+ module CSS): labeled chips (GoalIcon 24–36px + `example.root`/`label`), horizontal scroll-snap, `role="tablist"`, used in: mobile hero, goals section, explorer takeover, and features section header (so examples can be flipped in place — restoring the desktop rail's function on mobile).
- `LandingExampleRail` remains desktop-only and untouched.

### 6. Beta section

- Order on mobile: section heading + body → signup panel (form) → audience heading → audience cards as compact single-column cards with tightened type (or 2-col at 621–980px, which already exists). Achieve reorder with CSS `order` inside the existing grid (DOM order unchanged for a11y/SEO sanity — heading order stays logical since each block keeps its own heading).
- Form inputs: `font-size: 16px` minimum (prevents iOS zoom-on-focus), full-width button ≥48px tall.

### 7. Copy (optional, small)

- `client/src/content/landing.md` + `landingContent.js`: add an optional `**Mobile Body:**` field in the Hero block for a shorter explainer used <621px (fallback to full body if absent). Everything else reuses existing content fields.

### Constraints & non-goals

- **Perf budget**: build fails >175 kB gzip JS / 20 kB gzip CSS on the landing entry closure. All new interactive surfaces (takeovers) are `lazy()` chunks; `LandingExampleSwitcher`/`LandingAppFrame` are small and CSS-driven. No new dependencies — carousels are pure CSS scroll-snap.
- Desktop ≥981px is not visually changed.
- `prefers-reduced-motion` respected in all new transitions; takeovers trap focus and restore it on close.
- The boot shell in `index.html` only mirrors the *hero*; keep its mobile rules in lockstep with §2 so there is no layout shift at handoff (`landingHtmlPreload.test.js` / boot architecture tests may assert this).

### Files touched (summary)

| File | Change |
|---|---|
| `client/src/pages/Landing.jsx` | Mobile nav rail, hero CTAs/chips, locked inline tree + takeover wiring, beta reorder hooks |
| `client/src/pages/Landing.module.css` | Rewritten <981px rules: sticky header, pill rail, hero, snap rows, canvas, beta |
| `client/src/hooks/useActiveLandingSection.js` | Vertical scroll-spy mode |
| `client/src/components/landing/LandingExampleSwitcher.jsx` + css | New |
| `client/src/components/landing/LandingTakeoverShell.jsx` + css | New (shared full-screen overlay shell) |
| `client/src/components/landing/LandingExplorerTakeover.jsx` + css | New (lazy) |
| `client/src/components/landing/LandingAppFrame.jsx` + css | New |
| `client/src/components/landing/LandingFeaturesSection.jsx` + css | Pill tabs, framed stage, card carousel, takeover; delete crushed-preview mobile min-heights |
| `client/src/content/landing.md`, `landingContent.js` | Optional `Mobile Body` hero field |
| `client/index.html` | Boot-shell mobile CSS sync |
| Tests under `pages/__tests__`, `components/landing/__tests__`, `utils/__tests__` | Update + new coverage |

## Verification

1. `cd client && npm run build` — entry-closure budget must still pass (144 kB JS / 9.6 kB CSS baseline; headroom exists but confirm).
2. `npm test` (client) — update `Landing.test.jsx`, `LandingFeaturesSection.test.jsx`, boot-shell/html-preload tests; add tests for: switcher renders labels, explorer takeover opens/locks body scroll/closes on Escape, app frame scales and exposes full-screen button, vertical scroll-spy reports active section.
3. Run the app (`/landing-preview` in local dev) and inspect at 390×844, 430×932, 768×1024, and 981px boundary — screenshot each section; verify: no horizontal body scroll, sticky nav + scroll-spy, hero chips labeled, inline tree locked with working demo chips, both takeovers usable (pan/zoom tree, scrollable feature preview), beta form usable without iOS zoom.
4. Verify desktop ≥981px is pixel-unchanged (spot-check hero, snap navigation, rail).
5. Boot-shell handoff: hard-reload mobile viewport with cold cache and confirm no flash/layout shift between static shell and hydrated hero.

## Post-approval

Per CLAUDE.md: save this plan as a markdown file in `/planning/` once confirmed.
