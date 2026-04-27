# Plan: Programs Page Sidebar Restructure

## Context

The programs page (`ProgramCalendarPage.jsx`) currently has a sidebar with two tabs: **Details** and **Notes**. The request is to:
1. Move Notes out of the sidebar toggle and embed it directly into the Details view (matching how SessionDetail works — Notes lives inside the Details panel, not as a separate tab)
2. Replace the Notes tab slot with a **Goals** tab that shows the program's goal hierarchy (currently embedded in Details as the `ProgramSidebar` component)
3. This gives the sidebar 3 logical sections: Details (metrics + notes inline), Goals (toggled via tab)

The model to match is `SessionSidePane.jsx`, where:
- **Details** tab = session info + controls + notes inline
- **Goals** tab = goal associations panel (separate tab)

## DB/Architecture Grade: B+

The current structure is solid — data is already available, components exist. This is purely a UI reorganization with no backend changes needed.

## Target State (S+)

The sidebar has **Details** and **Goals** tabs (matching session detail pane pattern):

- **Details tab** (default):
  - Program description (if any)
  - `ProgramSidebar` metrics (days remaining, sessions, duration, goals)
  - Active block metrics
  - `NoteComposer` + `NoteTimeline` (notes inline, below metrics — same as NotesPanel in session detail)
- **Goals tab**:
  - `ProgramSidebar`'s goal hierarchy list (`GoalHierarchyList` via `ProgramSidebar` goals section only)

## Files to Change

### 1. `client/src/pages/ProgramCalendarPage.jsx`

**`ProgramSidePane` component (lines 161–286):**

- Change `view` state options from `['details', 'notes']` to `['details', 'goals']`
- In the `SidePaneHeader`, update the toggle buttons: **Details** | **Goals** (remove Notes button)
- In `view === 'details'` panel:
  - Keep description paragraph
  - Keep `ProgramSidebar` (metrics section)
  - **Add** `NoteComposer` + `NoteTimeline` below the metrics (move from the old `view === 'notes'` block)
- In `view === 'goals'` panel (new):
  - Render only the goal hierarchy portion — can reuse `ProgramSidebar` with a `hideMetrics` prop, OR pass only the goal seeds and render `GoalHierarchyList` directly
  - Simplest approach: add a `hideMetrics` prop to `ProgramSidebar` and render it in Goals tab mode showing only the goal hierarchy

**`ProgramCalendarPage` main component:**

- Change initial `sidePaneView` state from `'details'` to `'details'` (no change needed)
- In `Program Options` modal, remove the "Program Notes" option button (lines 946–958) OR change it to switch to Goals tab — since notes are now always visible in Details, the shortcut button is no longer needed. Remove it.

### 2. `client/src/components/programs/ProgramSidebar.jsx`

Add a `hideMetrics` prop (default `false`). When `true`, skip rendering the metrics block and active block metrics, showing only the goal hierarchy list. This enables Goals-only rendering in the Goals tab.

### 3. `client/src/pages/ProgramCalendarPage.module.css`

The `.sidebarSlot` currently has `flex: 1` for the Details view. In the new Details view it needs to accommodate both metrics + notes scrollably. Update:
- `.sidePaneNotes` padding/gap — notes will now be part of the details column, not a top-level pane. May need to adjust to flow naturally after metrics.
- `.sidebarSlot` should not flex-grow in the new layout; metrics + notes should scroll together.

Concretely: wrap both ProgramSidebar and notes into a scrollable column inside the details pane. The `.sidePaneNotes` section can be used as-is but should not have its own flex container competing with `.sidebarSlot`.

## Implementation Steps

1. **`ProgramSidebar.jsx`**: Add `hideMetrics` prop; wrap the metrics section in `{!hideMetrics && ...}` guards
2. **`ProgramCalendarPage.jsx` — `ProgramSidePane`**:
   - Change toggle from `details/notes` to `details/goals`
   - Details view: render description → ProgramSidebar (full) → NoteComposer → NoteTimeline
   - Goals view: render ProgramSidebar with `hideMetrics` prop
   - Optionally: render a "No goals attached" empty state when `programGoalSeeds` is empty
3. **`ProgramCalendarPage.jsx` — main component**:
   - Remove the "Program Notes" shortcut from the Program Options modal
4. **CSS**: Ensure details pane scrolls as one column; tweak note section spacing so it flows naturally below metrics

## Verification

- Open programs page — sidebar shows Details and Goals tabs only
- Details tab: metrics render above NoteComposer + NoteTimeline; can write and see notes
- Goals tab: shows goal hierarchy without metrics
- Hide Sidebar button still works
- Program Options modal no longer shows Program Notes shortcut
- No regressions: calendar view, blocks view, adding blocks/days all still work
