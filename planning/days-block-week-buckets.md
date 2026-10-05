# Days tab: block and week buckets above the date rail

## Context

The Days tab's date rail (`PlanOccurrenceStrip`) is one scrolling line of *every* date a program day occurs on, across the whole program. A day that repeats Mon/Wed/Fri over a 4-month program has about 50 chips with nothing to orient by. Blocks and (now) tracked weeks exist, but the rail doesn't use them. The only context is the "Month 1 · Week 3" line under the rail.

The user wants two rows of **buckets** above the rail:
- **Blocks**: one bucket per block, sized by length.
- **Weeks**: the weeks of the selected block, filling the full width.

Picking a bucket narrows the rail to that block/week. This turns a flat list into a program → block → week → date drill-down.

**Revised after review (implemented):** buckets **jump** the rail to the first date of the
picked period instead of filtering it (the rail keeps every date); block names are written in the
block's colour (no fill, no side stripe); the two rows form one connected ruler with the week row
hanging off the selected block's colour line; the "Block"/"Week" row labels are removed. Sections
below that describe filtering, `visibleDates`, `scopeDates`, or picking the next upcoming date are
superseded by this note.

Decisions confirmed (originally):
- The Weeks row shows **the selected block's weeks** (not all program weeks).
- Picking a bucket **filters the rail** to that bucket and selects a date in it. Buckets with no dates for this day are dimmed and disabled.
- Blocks that don't track weeks fall back to **7-day weeks from the block start**: `blockWeeks(start, end, null)`, the same stepping metrics use.

## Grade of the current system against this goal: **C+**

| Area | Grade | Why |
|---|---|---|
| Rail navigation | C | Flat list of all occurrences. Arrows step one date at a time and there is no way to jump to "Month 3, week 2". |
| Program structure in the Days tab | C | Block and week appear only as a text line under the rail (`blockWeekLabel`). They can't be clicked and don't show where the user is in the program. |
| Reusable foundations | A− | `blockWeeks` / `trackedWeekStartDay` (`utils/programBlockWeeks.js`), `blockForDate` (`utils/programViewModel.js`), `pickDefaultDate` and `occurrenceStatus` (`utils/programDaysView.js`) are already pure, tested, and shared with the server. |
| Selection model | B+ | `resolveDaysSelection` derives everything from `{dayId, date, compareDate}`, so buckets can be **derived** from the selected date with no new state. |

## Target design (S+)

### Behaviour
- **The scope is derived from the selected date**, so no new selection state is needed and nothing can drift out of sync:
  - the selected block is `blockForDate(blocks, date)`
  - the selected week is the bucket week that contains `date`
- **The rail shows only the selected week's dates.**
  - The ‹ › arrows still step through *all* of this day's dates.
  - Stepping past the end of the week moves into the next week, and both bucket rows follow.
- **Picking a block** selects a date in that block and then filters to its week. The date is the first upcoming date in the block if there is one, otherwise its latest date (`pickDefaultDate` applied to the bucket's dates).
- **Picking a week** selects a date in that week the same way.
- **Empty buckets** are visible but disabled, with a title such as "No Leg Day dates in Week 2". Disabled buckets keep the program's shape readable.
- **Dates outside every block**, if the program has gaps:
  - An extra **"Outside blocks"** bucket is added, but only when this day has dates there.
  - When it is selected, the Weeks row is hidden and the rail shows those dates.
- **Compare mode:**
  - Each column has its own rail, so each column gets its own bucket rows above its rail.
  - The left column can sit in last week while the right column plans this week.
  - Picking a bucket in a column runs through that column's `onSelect`, so swapping with the other column still works (`pickColumnDate`).
- **When the day changes in the sidebar**, the buckets recompute from the new day's occurrences.

### Visual
- Two stacked rows, each one line tall (about 26px), aligned to the rail's width between the arrows.
  - Small muted row labels "Block" / "Week" sit to the left.
  - The labels are visually hidden on narrow screens.
- Bucket sizes:
  - Block buckets: `flex-grow` = the block's day count, with `min-width` set so names don't truncate badly.
  - Week buckets: `flex-grow` = the week's day count, so a partial Week 1 is visibly narrower.
- Labels:
  - Blocks show the block name, with a 3px left border in the block colour.
  - Weeks show "W1", "W2", …; the title is "Week 2 · Oct 6 – Oct 12 · 2 of 3 done".
- Selected bucket: brand-soft background with a brand border, matching `.stripDate[aria-pressed='true']`.
- Today's bucket: a small dot.
- Done count: each bucket shows a subtle progress underline (completed ÷ dates in the bucket for this day), using `occurrenceStatus`.
- Scrolling: each row scrolls horizontally on overflow (`scrollbar-width: none`) and scrolls its selected bucket into view, like the rail.
- The text line "Month 1 · Week 3" under the rail (`columnContext`) is **removed**, because the buckets now show it.

### Accessibility
- Each row is a `role="group"` with an aria-label of "Blocks" / "Weeks of Month 1".
- Buckets are `<button aria-pressed>`. Their aria-labels include the name, the date range, and the count of this day's dates in the bucket.
- Disabled buckets use `aria-disabled`, not `disabled`, so they stay discoverable.
- The existing polite live region announces the new date when a bucket click changes it.
- Touch targets are at least 44px under the 768px media query, matching the rail.

## Implementation

**New pure util: `client/src/utils/programDayBuckets.js`**
- `buildDayBuckets(blocks, occurrences, today)` returns:
  - `blocks`: `[{ id, name, color, start, end, length, dates, completed, weeks: [{ index, start, end, partial, length, dates, completed }] }]`
  - `outside`: `{ dates, completed }` or `null`
  - Blocks are sorted by start date. Weeks come from `blockWeeks(start, end, trackedWeekStartDay(block))`; when the block doesn't track weeks this is `blockWeeks(start, end, null)`, which gives the 7-day fallback. Dates are assigned with `blockForDate`. `completed` counts dates where `occurrenceStatus(o) === 'complete'`.
- `bucketScope(buckets, date)` returns `{ block, week, outside }` for the selected date.
- `pickBucketDate(dates, today)` delegates to `pickDefaultDate`.

**New component: `client/src/components/programs/days/PlanBucketRows.jsx`, plus CSS in `ProgramDaysView.module.css`**
- Props: `buckets`, `scope`, `today`, `blockedDate`, `label`, `onSelect(date)`.
- Renders the Block row and the Weeks row (or nothing when the program has no blocks, which keeps today's behaviour).

**`PlanOccurrenceStrip.jsx`**
- New optional `visibleDates` prop (a Set). Chips are filtered to it.
- The arrows keep using the full `selectable` list.

**`ProgramDaysView.jsx`**
- Compute `buckets` once per day: `useMemo(() => buildDayBuckets(program.blocks, occurrences, today))`.
- Per column, compute `scope = bucketScope(buckets, value)`.
- Render `<PlanBucketRows>` above `<PlanOccurrenceStrip visibleDates={scope dates}>` inside the `rail` slot, using the same `onSelect` handler the rail uses. Drop the `context` / `blockContext` prop.

**`PlanDateColumn.jsx`**
- Remove the `context` prop and the `.columnContext` style, since the buckets now carry it.

**Docs**
- `index.md` Programs → Days tab: one line about the bucket drill-down.

## Critical files

- New: `client/src/utils/programDayBuckets.js`, `client/src/components/programs/days/PlanBucketRows.jsx`
- Edit: `client/src/components/programs/days/ProgramDaysView.jsx`, `PlanOccurrenceStrip.jsx`, `PlanDateColumn.jsx`, `ProgramDaysView.module.css`, `index.md`
- Reused: `blockWeeks`, `trackedWeekStartDay` (`utils/programBlockWeeks.js`); `blockForDate` (`utils/programViewModel.js`); `pickDefaultDate`, `occurrenceStatus`, `pickColumnDate` (`utils/programDaysView.js`)
- No backend change: the occurrences and blocks are already in the client payload.

## Tests

**`utils/__tests__/programDayBuckets.test.js`**
- Tracked weeks use the chosen start day; an untracked block gets 7-day weeks.
- Dates are assigned to the right block and week, and completed counts are right.
- The "outside blocks" bucket appears only when this day has dates there.
- `bucketScope` resolves a date's block and week; `pickBucketDate` prefers an upcoming date.

**`components/programs/days/__tests__/ProgramDaysView.test.jsx`**
- The rail shows only the selected week's dates.
- Clicking a block bucket selects that block's next date, and the Weeks row switches to its weeks.
- Clicking a week selects a date in it.
- Empty buckets are aria-disabled and do nothing.
- The arrows cross a week boundary and the buckets follow.
- In compare mode, each column scopes independently.
- A program with no blocks renders the rail unchanged.

## Verification

1. `cd client && npx vitest run` and `npx eslint src` should both pass.
2. In the app, open Programs → Days for a multi-block program:
   - The buckets sit above the rail.
   - Pick Month 2: the Weeks row shows its weeks and the rail narrows to one week.
   - Step › past Sunday: W advances.
   - Turn on compare and scope the left column to an earlier week.
   - Check a block without Track weeks: it shows 7-day weeks.
   - Check at phone width: the rows scroll and there is no page overflow.
3. After approval, save this plan as `planning/days-block-week-buckets.md`.
