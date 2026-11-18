# Admin Overview: sub-tabs and compact analytics

## Context

Admin → Overview shows everything on one long page.

Current order:
1. Account summary cards
2. The date range filter
3. The whole Acquisition & engagement panel: four big KPI cards, the WAP chart, the funnel table, the visitors chart, referrers and campaigns, feature use
4. Four more KPI cards
5. The DAU chart
6. The per-user table
7. The full domain-events table, which has its own filter chips and search
8. Top pages
9. Email delivery
10. Three storage tables, the live-window controls and export status

Tables use 14 px × 16 px cell padding. Charts are a fixed 220 px tall. Nothing is grouped, so to review one area you scroll past everything else.

**Goal:** Review one area at a time. Overview gets sub-tabs for each area, with a short summary as the default. Tables and charts are dense enough that each tab fits on about one screen at desktop width. Everything still works at phone width.

## Grade of the current page: **C**

| Area | Grade | Evidence |
|---|---|---|
| Information architecture | D | One ~10-section scroll mixes product KPIs, people and email with database housekeeping. The headline KPI (WAP) is in the middle of the stack |
| Density | C− | 14/16 px cell padding, 86 px-tall KPI cards, and fixed 220 px charts stacked in one column even on wide screens |
| Scannability | C | No numeric alignment (`tabular-nums`, right-aligned counts). Long tables (users, events, relations) have no height cap |
| Reuse | B | Shared `DauBarChart`, `DateRangeFilter` and `EventsBreakdownTable`, and Chart.js theming. A tabs component already exists but isn't used |
| Accessibility | B− | Charts have `aria-label`s. The top-level tabs are plain buttons, not a `tablist` |

## S+ plan

### 1. Sub-tabs inside Overview
`UsagePanel` becomes a small shell:
- the date range filter
- a `ViewToggleTabs` row (`client/src/components/common/ViewToggleTabs.jsx`, `semantics="tabs"`, `ariaLabel="Overview sections"`), which already provides `role="tablist"` with `aria-selected`
- one view rendered under it, in a `role="tabpanel"`

It keeps the one `/api/admin/usage` query, so switching tabs is instant and makes no new request.

The sub-tab is saved in the URL as `?view=` (`useSearchParams`), so a reload or a shared link reopens the same area. An unknown value falls back to Summary.

| Tab | Contents |
|---|---|
| **Summary** (default) | The headline numbers on one compact KPI strip: WAP with its week-on-week change, % practising, visitors, visitor → sign-up, active in 7 and 30 days, sign-ups, page views. Below it, the WAP chart and a 4-row funnel preview, each linking to its tab ("Open Acquisition →"). The existing account totals (users, fractals, …) move here from above the tabs |
| **Acquisition** | Visitors per day chart. A two-column grid on wide screens: the funnel table on the left, top referring sites and top campaigns on the right. The `live_since` note |
| **Engagement** | Side by side: the WAP chart and the DAU chart. Below: feature use and top pages. The note that product events in Postgres only go back a limited time |
| **Users** | The per-user table: sortable by any column, with a search box |
| **Events** | `EventsBreakdownTable` as it is, plus the activity-history-by-event-type table |
| **System** | Email delivery, the quota gauge, event storage, the live-window controls, export status, and the database relations (collapsed in a `<details>` by default) |

The date filter doesn't affect System's storage data, so on that tab it gets a one-line caption: "Storage shows the database as it is now; the range only affects email."

### 2. Split the components
Split by area so each file stays small, within the maintainability audit's line budgets:
- `GrowthPanel.jsx` splits into `AcquisitionView.jsx` (traffic, funnel and sources) and the WAP and feature-use parts of `EngagementView.jsx`.
- `FunnelTable` and `NamedCounts` become small components in `admin/usageParts.jsx` so Summary can reuse them.
- New files: `UsageSummaryView.jsx`, `UsageUsersView.jsx` (the per-user table, moved out of `UsagePanel`), and `UsageSystemView.jsx`. `UsageSystemView` wraps the email table and the existing `UsageStoragePanel`.
- `GrowthPanel.module.css` becomes `UsageViews.module.css`, which also holds the grid and the KPI strip.

### 3. Compact tables and charts
In `Admin.module.css`:
- **`.compactTable` modifier:**
  - cell padding 6px × 10px, `font-size-sm`
  - header row stays visible on scroll (`position: sticky`)
  - count columns use `.num` (right-aligned, `tabular-nums`)
  - long tables (users, events, relations) sit in a `.tableScroll` wrapper capped at about 420px tall, with `overflow:auto`
- **`.kpiStrip`:** cards about 56px tall, `font-size-xl` values, `minmax(150px,1fr)` columns. Labels stay uppercase and small.
- **`.viewGrid`:** `grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr))`, so it collapses to one column on phones without a media query.

`DauBarChart` gets a `height` prop. The default stays 220 so other uses don't change; the views pass 160. A new `compact` flag hides the axis titles, since each section heading already names the series, and caps ticks at 8.

These classes apply only to Overview. Other admin tabs keep the current table style.

### 4. Users table gets sort and search
The search filters by username or email. Each column header is a `<button>` that sorts by that column; sorting it again flips the direction. The header shows `aria-sort`. The default sort is Last Seen, newest first.

This keeps the table useful now that it has its own tab. The sorting is done in the browser on the rows the API already returns.

### 5. Top-level admin tabs
Admin's own tab row keeps its look but gets `role="tablist"` and `aria-selected` so both levels behave the same for screen readers. This is a one-line change per button in `Admin.jsx`, with no restyle.

## Critical files
- `client/src/components/admin/UsagePanel.jsx`: becomes the shell
- New: `UsageSummaryView.jsx`, `AcquisitionView.jsx`, `EngagementView.jsx`, `UsageUsersView.jsx`, `UsageSystemView.jsx`, `usageParts.jsx`, `UsageViews.module.css`. These replace `GrowthPanel.jsx` and `GrowthPanel.module.css`
- `client/src/components/admin/DauBarChart.jsx` (`height`, `compact`), `UsageStoragePanel.jsx` (compact tables, relations in `<details>`), `EventsBreakdownTable.jsx` (compact table)
- `client/src/pages/Admin.jsx`: move the account totals into Summary; tablist roles
- `client/src/pages/Admin.module.css`: `.compactTable`, `.num`, `.tableScroll`, `.kpiStrip`, `.viewGrid`
- Reuse: `ViewToggleTabs` and `DateRangeFilter` (`components/common`), the `LiveSinceNote` and `useChartThemeDefaults` theming

## Verification
- **Unit tests (Vitest):**
  - `UsagePanel.test.jsx`: Summary is the default. Every tab renders its sections. `?view=users` opens Users. An unknown `?view` falls back to Summary. Switching tabs doesn't refetch.
  - One test file per view. Existing GrowthPanel assertions move to `AcquisitionView` and `EngagementView` tests. The Users sort and search have their own tests.
  - `Admin.test.jsx` still passes, and the tablist roles are present.
- **Gates:** `./run-tests.sh frontend lint` (maintainability, responsive and contrast audits).
- **In the browser:** run the app and open Admin → Overview at 1440px and 390px wide. Check that each tab fits about one screen on desktop, there's no horizontal page scroll on a phone, and sticky headers work inside the scroll boxes. Check both themes.
- After approval, save the plan as `planning/admin-overview-subtabs-2026-11.md`.
