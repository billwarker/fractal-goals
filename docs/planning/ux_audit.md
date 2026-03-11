# UX Audit — 55 Recommendations

> Audited: March 10, 2026
> Scope: All frontend pages, components, contexts, and interaction flows

---

## Scoring Rubric

Each recommendation is tagged with:
- **Impact**: 🔴 High · 🟡 Medium · 🟢 Low — how much the user experience improves
- **Effort**: S (small, < 1 day) · M (medium, 1–3 days) · L (large, 3+ days)
- **Area**: The functional area or cross-cutting concern

---

## A. Navigation & Wayfinding (1–7)

### 1. Add breadcrumbs to all subpages 🔴 M
**Current:** When viewing a session detail, goal modal, or program detail, there's no contextual trail showing where the user is within the hierarchy (`Fractal → Sessions → Session #3`).
**Recommendation:** Add a persistent breadcrumb bar below the nav header. Show the path from the fractal root to the current page. Each segment should be clickable for quick navigation.
**File:** `AppRouter.jsx` L119-166 (NavigationHeader)

### 2. Add nav icons alongside uppercase text labels 🟡 S
**Current:** Nav items are plain uppercase text (`GOALS`, `PROGRAMS`, `SESSIONS`, etc.) with no visual differentiation.
**Recommendation:** Add small icons next to each nav label (🎯 Goals, 📋 Programs, ⏱ Sessions, 📊 Analytics, 📝 Logs). Icons improve scannability, especially on mobile where the labels are compressed into a single row.
**File:** `AppRouter.jsx` L70-76 (navItems array)

### 3. Highlight the "+ ADD SESSION" button more prominently 🟡 S
**Current:** The "+ ADD SESSION" CTA is a plain text button in the nav bar, visually indistinct from nav links.
**Recommendation:** Style it as a prominent pill/primary button with the brand color and a subtle pulse or glow to draw attention. This is the most important action in the app and should feel like a primary CTA.
**File:** `AppRouter.jsx` L126-131, `AppRouter.module.css`

### 4. Add a "Quick Switch" fractal dropdown in the nav bar 🟡 M
**Current:** To switch between fractals, the user must click "EXIT TO HOME" → Selection page → pick another fractal. This is 3 clicks minimum.
**Recommendation:** Add a dropdown/popover on the fractal name that lists all fractals for quick switching without leaving the current page.
**File:** `AppRouter.jsx` L124 (fractalName span)

### 5. Remember last visited page per fractal 🟡 S
**Current:** Entering a fractal always lands on `/goals`. If the user was working on Sessions, they have to re-navigate.
**Recommendation:** Store the last-visited page per fractal in localStorage and navigate there on re-entry.
**File:** `Selection.jsx` L111-114 (handleSelectRoot)

### 6. Add keyboard shortcuts for core navigation 🟢 M
**Current:** No keyboard shortcuts exist.
**Recommendation:** Add `Cmd/Ctrl+1` through `5` for Goals/Programs/Sessions/Analytics/Logs. Add `Cmd/Ctrl+N` for "Add Session". Add `Escape` to close modals. Show a shortcut legend in Settings.
**File:** New hook `useKeyboardShortcuts.js`

### 7. Mobile bottom tab bar instead of horizontal scroll 🔴 M
**Current:** Mobile nav packs all items into a single horizontally scrollable row of small buttons. The user must scroll to reach "LOGS" or "EXIT".
**Recommendation:** Replace with a fixed bottom tab bar (5 icons + labels). Move "Settings" and "Exit" to a hamburger menu or swipe gesture. The tab bar is the standard mobile pattern and is far more discoverable.
**File:** `AppRouter.jsx` L80-116 (mobile nav branch)

---

## B. Onboarding & Empty States (8–14)

### 8. First-time user onboarding flow 🔴 L
**Current:** After signup, the user lands on an empty Selection page with a "+" card. No guidance on what a "fractal" is, what to do first, or how the app works.
**Recommendation:** Create a first-use onboarding overlay (3–5 steps): explain fractal concept → create first goal → create first activity → create first session. Use a coach marks or spotlight tutorial pattern.
**File:** New component `OnboardingWizard.jsx`

### 9. Enriched empty states with illustrations and actions 🟡 M
**Current:** Empty states are minimal text. Examples:
- Sessions: `"No sessions found. Start by clicking '+ ADD SESSION' in the navigation."` (L277)
- ManageActivities: `"No activities defined yet"` + a button (L459)
- Logs: `"No events matching your filters."` (L91)
**Recommendation:** Replace with illustrated empty states that include: an SVG illustration or icon, a short explanation of what the section does, a primary CTA button, and optionally a link to documentation. Programs page already does this well (L158-174) — standardize that pattern across all pages.

### 10. Contextual "next step" suggestions after key actions 🟡 M
**Current:** After creating a goal, session, or activity, the user gets a toast and is left to figure out the next step.
**Recommendation:** After key actions, show a contextual suggestion:
- After creating a goal → "Add activities to this goal" or "Create a sub-goal"
- After creating an activity → "Associate it with a goal"
- After completing a session → "View your analytics" or "Start next session"
**File:** Leverage `notify.custom()` (already available) with a richer component

### 11. Selection page — show fractal status/health at a glance 🟡 M
**Current:** Fractal cards show only name, type, and creation date. The user has to enter each fractal to assess its state.
**Recommendation:** Add summary stats to each fractal card: active session count, completion percentage, last activity timestamp. This helps the user decide which fractal to work on.
**File:** `Selection.jsx` L286-330 (fractal card render)

### 12. Create Session — add a "Quick Start" option 🔴 M
**Current:** Creating a session requires navigating to a separate page, selecting a template or program day, and clicking create. The multi-step flow has 3+ decisions.
**Recommendation:** Add a "Quick Start" button on the Sessions page that creates a session from the most recently used template or currently active program day with a single click. For power users, add a "Repeat Last Session" CTA.
**File:** `Sessions.jsx` header actions area (L251-270), `CreateSession.jsx`

### 13. Show "getting started" checklist for new fractals 🟡 M
**Current:** After creating a new fractal, the user sees only an empty goal tree. No guidance on how to set up the hierarchy.
**Recommendation:** Show a transient checklist overlay: ☐ Create your first sub-goal ☐ Define activities ☐ Create a session template ☐ Start your first session. Dismiss automatically when all items are completed.
**File:** `FractalGoals.jsx`, new component `GettingStartedChecklist.jsx`

### 14. Error state improvements 🟡 S
**Current:** Some error handling uses `alert()` (Selection.jsx L126, L139). Others use `console.error` without user-facing feedback (ManageActivities.jsx L100-101).
**Recommendation:** Replace all `alert()` calls with `notify.error()`. Ensure every catch block surfaces a user-readable message. Add retry buttons to error states.
**File:** `Selection.jsx`, `ManageActivities.jsx`, various catch blocks

---

## C. Session Experience (15–22)

### 15. Session progress indicator during active sessions 🔴 M
**Current:** During an active session, there's no visual indicator of overall progress (how many activities completed vs. total).
**Recommendation:** Add a progress bar or ring at the top of the session detail view showing `completed / total activities`. Update in real-time as activities are started and completed.
**File:** `SessionDetail.jsx`, `SessionDetailMobileChrome.jsx`

### 16. Timer visualization with elapsed time display 🟡 M
**Current:** Timers are functional but lack a prominent visual countdown/elapsed display.
**Recommendation:** Add a large, prominent elapsed-time display for the active timer. Use a circular progress indicator if the activity has an estimated duration. Make the timer visually dominant during an active session.
**File:** Session detail timer components

### 17. Session completion celebration/summary 🟡 M
**Current:** Completing a session shows a toast notification. No summary or celebration moment.
**Recommendation:** Show a completion summary modal with: total duration, activities completed, goals progressed, new achievements, and a "View Analytics" CTA. Add a subtle confetti or pulse animation for the first time a goal's targets are fully met.
**File:** New component `SessionCompletionSummary.jsx`

### 18. Auto-save indicator should feel more reassuring 🟢 S
**Current:** Auto-save shows "Saving changes..." / "Saved" / "Save failed" as small text. Easy to miss.
**Recommendation:** Use a more prominent indicator: a small dot in the nav bar (green = saved, yellow = saving, red = failed) with tooltip on hover. Add a saved timestamp ("Saved 2 sec ago").
**File:** `SessionDetail.jsx` L169-175

### 19. "Unsaved changes" warning before navigation 🔴 S
**Current:** There's no navigation guard. If a user has unsaved changes and navigates away, data is silently lost.
**Recommendation:** Use `react-router`'s `useBlocker` / `usePrompt` to warn users before leaving with unsaved changes. The auto-save system should minimize this, but edge cases exist (failed saves, offline).
**File:** Session detail, goal edit mode

### 20. Session list — show more at-a-glance info 🟡 M
**Current:** Session cards show name, date, and expandable inline detail. It's hard to scan many sessions quickly.
**Recommendation:** Add visual badges for: ✅ completed, ⏱ total duration, 📊 activities count, 🏷 template name. Color-code the left border by completion status. Show a small sparkline of activity durations for completed sessions.
**File:** `SessionCardExpanded.jsx` in `components/sessions/`

### 21. Inline session creation from Sessions page 🟡 M
**Current:** Creating a session requires navigating to `/create-session`, which breaks the flow.
**Recommendation:** Add a floating action button or inline card on the Sessions page that opens a slide-over panel for session creation, keeping the sessions list visible. The user can glance at existing sessions while setting up a new one.
**File:** `Sessions.jsx`, new component

### 22. Session notes — add markdown preview 🟢 S
**Current:** Notes are plain text with a `Linkify` wrapper for URL detection.
**Recommendation:** Support basic markdown formatting (bold, italic, bullet lists, headers) in notes with a live preview. Use a lightweight markdown renderer like `react-markdown`.
**File:** `SessionNotesPreview.jsx`, `SessionNotesSidebar.jsx`

---

## D. Goal System (23–30)

### 23. Visual goal progress tracking on the flow tree 🔴 M
**Current:** Goal nodes in the flow tree show names and type. Completion status is a binary flag.
**Recommendation:** Add a mini progress ring on each goal node showing target completion percentage. Use color intensity to indicate progress (faded = 0%, full = 100%). Completed goals should have a distinct visual treatment (checkmark overlay, gold border, etc.).
**File:** `FlowTree.jsx`, `flowTree/` component directory

### 24. Goal detail — better visual hierarchy 🟡 S
**Current:** GoalDetailModal packs a lot of information into a scrollable panel. The header, SMART indicators, targets, activities, and children all compete for attention.
**Recommendation:** Group content into clear sections with collapsible headers: "Overview" (name, description, SMART status), "Targets" (with progress bars), "Activities" (with association controls), "Children" (with subtree preview). Default-collapse sections that aren't immediately actionable.
**File:** `GoalViewMode.jsx`, `GoalEditForm.jsx`

### 25. Drag-and-drop goal reordering in the tree 🟡 L
**Current:** Goals in the flow tree are positioned algorithmically. There's no way to manually reorder children.
**Recommendation:** Allow drag-and-drop reordering of sibling goals within the tree. This gives users control over the visual hierarchy. Persist `sort_order` to the backend.
**File:** `FlowTree.jsx`, goal service

### 26. Goal search and filter 🟡 M
**Current:** No way to search for a specific goal in large trees. Users must visually scan the tree.
**Recommendation:** Add a search bar in the GoalTree page that highlights matching nodes and auto-navigates to them. Add filter buttons for: show completed, show only with targets, show only SMART goals.
**File:** `FractalGoals.jsx`, new `GoalSearch.jsx` component

### 27. Quick-add child goal from tree node 🟢 S
**Current:** Adding a child goal opens the full GoalDetailModal in create mode. This is heavy for quick additions.
**Recommendation:** Add a popover quick-add form (just name + type auto-inferred from parent) on the "+" button of each tree node. The full modal can still be accessed for detailed configuration.
**File:** `FractalGoals.jsx` L146-158 (handleAddChildClick)

### 28. Goal deadline visualization 🟡 M
**Current:** Deadlines are stored but not visually prominent. The user has to open each goal to check its deadline.
**Recommendation:** Show an urgency indicator on tree nodes and goal cards:
- 🟢 On track (> 7 days remaining)
- 🟡 Approaching (< 7 days)
- 🔴 Overdue
Also add a "Deadlines" view that lists all goals with deadlines in chronological order.
**File:** `FlowTree.jsx` node rendering, new `DeadlinesView.jsx`

### 29. Goal completion history timeline 🟢 M
**Current:** Goal completion is a binary state (completed/not). There's no visual history of when goals changed status.
**Recommendation:** Add a mini-timeline in the goal detail view showing: created → targets added → first activity logged → target X completed → goal completed. Data already exists in the event log system.
**File:** `GoalViewMode.jsx`, leverage `useLogsData` hook

### 30. SMART indicator — make it interactive and educational 🟡 S
**Current:** SMART indicators show which criteria are met/unmet as colored dots.
**Recommendation:** Make each indicator clickable with a tooltip explaining what it means and how to satisfy it. For unmet criteria, show a specific prompt: "Add a deadline to make this Time-bound" or "Add measurable targets to make this Measurable."
**File:** `SMARTIndicator.jsx`

---

## E. Activities & Management (31–36)

### 31. Activity card — show usage statistics 🟡 M
**Current:** Activity cards show name, group, metrics, and splits. The `lastInstantiated` date is available but not prominently displayed.
**Recommendation:** Add small usage stats to each card: total times used, last used date, average duration. This helps users identify stale activities they might want to archive.
**File:** `ActivityCard.jsx`

### 32. Drag-and-drop visual feedback improvements 🟡 S
**Current:** Drag-and-drop for moving activities between groups exists but uses basic CSS class toggling (`dropZoneActive`).
**Recommendation:** Add a ghost preview of the dragged activity card. Animate the drop zone expansion. Add a subtle bounce animation on successful drop. Provide haptic feedback on mobile (if supported).
**File:** `ManageActivities.jsx` drag handlers, `ManageActivities.module.css`

### 33. Bulk actions for activities 🟡 M
**Current:** Each activity must be edited/deleted individually. No multi-select.
**Recommendation:** Add a selection mode with checkboxes. Enable bulk actions: move to group, archive (soft-delete), export. This is especially useful for users with 20+ activities.
**File:** `ManageActivities.jsx`

### 34. Activity search and filter 🟡 S
**Current:** No search/filter on the Manage Activities page. Users scroll through groups to find activities.
**Recommendation:** Add a search bar that filters activities by name across all groups. Add a filter dropdown for: "Has metrics", "Has splits", "Used in last 30 days", "Unused".
**File:** `ManageActivities.jsx`

### 35. Activity archive instead of hard delete 🟢 S
**Current:** Deleting an activity is destructive with a confirmation modal.
**Recommendation:** Add an "Archive" action that soft-hides the activity from session templates and the activity builder, but preserves its data for historical sessions. Add an "Archived" section at the bottom of Manage Activities.
**File:** `ManageActivities.jsx`, `ActivityCard.jsx`, backend activity service

### 36. Metric definitions — live preview 🟢 M
**Current:** When defining metrics in the activity builder, the user sees field names and types but no preview of how they'll look during a session.
**Recommendation:** Add a mini-preview panel that shows how the metric input will render in the session detail view. This helps users validate their metric setup before saving.
**File:** `ActivityBuilder.jsx`, `activityBuilder/` components

---

## F. Programs (37–40)

### 37. Program calendar view 🔴 L
**Current:** Programs show blocks and days as lists. There's no calendar visualization.
**Recommendation:** Add a calendar view (month or week) that shows scheduled session days color-coded by block. Allow drag-and-drop to reschedule days. Show completed sessions as filled cells.
**File:** `ProgramDetail.jsx`, new `ProgramCalendar.jsx`

### 38. Program progress dashboard 🟡 M
**Current:** Program cards show block names and date ranges. No aggregate progress information.
**Recommendation:** Add a progress ring or bar to each program card showing: sessions completed / sessions planned. In the detail view, show per-block progress bars and streaks (consecutive completed days).
**File:** `Programs.jsx` card render, `ProgramDetail.jsx`

### 39. Active program quick actions in nav 🟡 S
**Current:** No indication of the active program in the nav bar.
**Recommendation:** If a program is active, show a small indicator in the nav (e.g., a dot next to "PROGRAMS" or a "Today's Session" chip). Clicking it navigates directly to today's program day for quick session creation.
**File:** `AppRouter.jsx` nav section

### 40. Program block transitions 🟢 M
**Current:** When a program block ends and a new one begins, there's no notification or visual marker.
**Recommendation:** Add a notification when a new block becomes active. Show a visual transition marker in the program detail view. Summarize the completed block's results.
**File:** `ProgramDetail.jsx`, notification system

---

## G. Analytics (41–45)

### 41. Analytics — guided first view 🟡 M
**Current:** Analytics opens with an empty window. The user must select a category, then a visualization. No guidance on what to look at first.
**Recommendation:** Show a default/recommended view on first load: "Time Spent This Week" or "Goal Progress Overview." Add a "Suggested Views" dropdown that pre-configures common analytics setups.
**File:** `Analytics.jsx` L72 (default layout)

### 42. Analytics — time range selector 🟡 M
**Current:** No global time range filter for analytics. All visualizations show all-time data.
**Recommendation:** Add a global date range picker (1 week / 1 month / 3 months / all time / custom) that applies to all windows. This lets users focus on recent trends.
**File:** `Analytics.jsx`, pass as prop to all `ProfileWindow` instances

### 43. Analytics — exportable snapshots 🟢 M
**Current:** No way to export or share analytics.
**Recommendation:** Add an "Export" button per window that generates a PNG screenshot or CSV of the underlying data. Enable a full-page PDF export for sharing progress with coaches/mentors.
**File:** `ProfileWindow.jsx`, use `html2canvas` or similar

### 44. Analytics — comparison overlays 🟡 L
**Current:** Each window is independent. No way to overlay two time periods or two activities on the same chart.
**Recommendation:** Add a "Compare" mode that overlays data from different time periods (this week vs. last week) or different activities on the same chart axes.
**File:** `ProfileWindow.jsx`, charting components

### 45. Annotations — inline creation from charts 🟡 M
**Current:** Annotations exist as a separate category in the window system.
**Recommendation:** Allow click-to-annotate directly on any chart data point. The user clicks a bar/point → a popover appears with an annotation text field → annotation is saved with the chart context. Much more intuitive than the separate annotations panel.
**File:** `ProfileWindow.jsx`, chart click handlers

---

## H. Loading States & Perceived Performance (46–49)

### 46. Replace all text loading states with skeletons 🔴 M
**Current:** Pages show plain text loading messages:
- `"Loading fractal data..."` (FractalGoals.jsx L208)
- `"Loading sessions..."` (Sessions.jsx L197)
- `"Loading analytics..."` (Analytics.jsx L202)
- `"Loading activities..."` (ManageActivities.jsx L253)
- `"Loading fractals..."` (Selection.jsx L227)
**Recommendation:** Replace all with skeleton placeholders that match the page layout. Show skeleton cards for lists, skeleton tree for the flow tree, skeleton charts for analytics. This dramatically improves perceived performance even without actual speed improvements.
**File:** All page files, new `Skeleton.jsx` component set

### 47. Add transition animations between pages 🟡 M
**Current:** Page transitions are instant with no visual continuity. Going from Sessions list → Session Detail feels abrupt.
**Recommendation:** Add subtle page transition animations: fade-in for new content, slide-in for sidepanels, expand-from-card for list→detail transitions. Use `react-transition-group` or `framer-motion`.
**File:** `AppRouter.jsx` route wrappers, new animation components

### 48. Optimistic UI for common mutations 🟡 M
**Current:** Some mutations wait for the server response before updating the UI (e.g., goal completion toggle, activity deletion).
**Recommendation:** Implement optimistic updates for: timer start/stop, goal completion toggle, note add/edit/delete, activity group drag-and-drop. If the server rejects, revert with a toast explaining the failure.
**File:** Various mutation hooks

### 49. Infinite scroll instead of "Load More" for sessions 🟢 S
**Current:** Sessions list uses a "Load More" button at the bottom (L297-319).
**Recommendation:** Replace with infinite scroll using an Intersection Observer. Less friction than clicking "Load More." Retain the option to "Jump to page" for users who want to skip ahead.
**File:** `Sessions.jsx` L297-319

---

## I. Mobile Experience (50–53)

### 50. Mobile session detail — swipe between activities 🟡 M
**Current:** Session detail on mobile shows a vertical list of sections/activities. This requires a lot of scrolling for sessions with many activities.
**Recommendation:** Add a swipe-based navigation between activities within a section. Show one activity at a time in a card format with swipe left/right to navigate. Keep the section list scrollable but show the current activity prominently.
**File:** `SessionSection.jsx`, mobile-specific layout

### 51. Mobile flow tree — pan and zoom improvements 🟡 M
**Current:** The flow tree on mobile is a compressed version of the desktop tree. With deep hierarchies, nodes can be tiny and hard to tap.
**Recommendation:** Add a mini-map overlay showing the current viewport. Improve pinch-to-zoom responsiveness. Add a "fit to screen" button. Show a breadcrumb trail of the zoom path.
**File:** `FlowTree.jsx`, `FractalGoals.jsx` mobile branch

### 52. Pull-to-refresh on main list pages 🟢 S
**Current:** No pull-to-refresh. Users must navigate away and back, or use the REFRESH button (only on Logs page).
**Recommendation:** Add pull-to-refresh on Sessions, Goals, Programs, and Activities pages. This is the most natural mobile pattern for fetching updated data.
**File:** All list pages, new `PullToRefresh.jsx` component

### 53. Mobile bottom sheet improvements 🟡 S
**Current:** The goal detail sidebar on mobile uses a bottom sheet with a simple collapsed/expanded toggle. The collapsed state shows just a chevron and title.
**Recommendation:** Add a drag handle with haptic feedback. Support three snap points: collapsed (header only), half-screen, full-screen. Add a swipe-down-to-dismiss gesture. The current binary open/closed feels restrictive.
**File:** `FractalGoals.jsx` L306-384 (sidebar rendering)

---

## J. Visual Polish & Micro-Interactions (54–55)

### 54. Add transition tokens to design system 🟡 S
**Current:** `design-tokens.css` defines colors, spacing, typography, and shadows but no transition/animation tokens.
**Recommendation:** Add standard transition tokens:
```css
--transition-fast: 150ms ease;
--transition-base: 250ms ease;
--transition-slow: 350ms ease-in-out;
--transition-spring: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
```
Use consistently across all interactive elements (buttons, cards, modals, sidebars).
**File:** `design-tokens.css`

### 55. Consistent hover, focus, and active states 🟡 M
**Current:** Hover and focus states vary across the app. Some buttons have hover effects, others don't. Focus rings are inconsistent (some use `--color-focus-ring`, others have no visible focus state).
**Recommendation:** Audit all interactive elements and ensure consistent:
- Hover: subtle background color shift (use `--color-bg-hover`)
- Focus: visible focus ring (use `--color-focus-ring`)
- Active: slight scale-down (`transform: scale(0.98)`)
- Disabled: reduced opacity + `cursor: not-allowed`
**File:** `App.css`, `design-tokens.css`, individual component CSS files

---

## Priority Matrix

### 🔥 Quick Wins (High Impact, Small Effort)
| # | Recommendation | Impact | Effort |
|---|----------------|--------|--------|
| 3 | Prominent "+ ADD SESSION" button | 🟡 | S |
| 14 | Replace `alert()` with `notify.error()` | 🟡 | S |
| 19 | Unsaved changes navigation guard | 🔴 | S |
| 30 | Interactive SMART indicators | 🟡 | S |
| 54 | Transition tokens in design system | 🟡 | S |

### 🎯 High-Impact Investments
| # | Recommendation | Impact | Effort |
|---|----------------|--------|--------|
| 1 | Breadcrumbs | 🔴 | M |
| 7 | Mobile bottom tab bar | 🔴 | M |
| 8 | Onboarding flow | 🔴 | L |
| 12 | Quick Start session creation | 🔴 | M |
| 15 | Session progress indicator | 🔴 | M |
| 23 | Goal progress on flow tree | 🔴 | M |
| 37 | Program calendar view | 🔴 | L |
| 46 | Skeleton loading states | 🔴 | M |

### 📈 Medium Value, Medium Effort
| # | Recommendation | Impact | Effort |
|---|----------------|--------|--------|
| 4 | Quick Switch fractal dropdown | 🟡 | M |
| 9 | Enriched empty states | 🟡 | M |
| 10 | Contextual next-step suggestions | 🟡 | M |
| 11 | Fractal card status stats | 🟡 | M |
| 17 | Session completion celebration | 🟡 | M |
| 20 | Session list at-a-glance badges | 🟡 | M |
| 24 | Goal detail visual hierarchy | 🟡 | S |
| 26 | Goal search/filter | 🟡 | M |
| 28 | Goal deadline visualization | 🟡 | M |
| 38 | Program progress dashboard | 🟡 | M |
| 41 | Analytics guided first view | 🟡 | M |
| 42 | Analytics time range selector | 🟡 | M |
| 47 | Page transition animations | 🟡 | M |
| 48 | Optimistic mutations | 🟡 | M |
| 55 | Consistent hover/focus/active states | 🟡 | M |
