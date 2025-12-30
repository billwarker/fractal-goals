# Activity Builder Redesign - Implementation Plan

## Objective
Redesign the Manage Activities page to display activities as a grid of tiles with a modal-based activity builder.

## Current State
- Activity builder takes up 2/3 of screen (left side)
- Saved activities list on right side (1/3)
- Edit/Duplicate/Delete buttons on each activity card

## Target State
- Grid layout of activity tiles across full page width
- "Create Activity" button in top-right corner (under nav bar)
- Activity builder opens in modal when:
  - "Create Activity" button clicked
  - "Edit" button clicked on existing activity
- Each activity tile shows:
  - Activity name
  - Description
  - Last instantiated date/time
  - Indicators (Sets, Splits, Metrics, etc.)
  - Edit/Duplicate/Delete buttons

## Implementation Steps

### 1. Extract Activity Builder to Component
**File:** `/client/src/components/ActivityBuilder.jsx`

**Purpose:** Reusable component for creating/editing activities

**Props:**
- `isOpen` - boolean to control modal visibility
- `onClose` - callback when modal closes
- `editingActivity` - activity object if editing, null if creating
- `rootId` - current root goal ID
- `onSave` - callback after successful save

**State:** (move from ManageActivities)
- Form fields: name, description, metrics, splits, flags
- Validation state
- Creating/loading state

### 2. Create Activity Card Component
**File:** `/client/src/components/ActivityCard.jsx`

**Purpose:** Display individual activity as a tile

**Props:**
- `activity` - activity object
- `lastInstantiated` - datetime of last use (from sessions data)
- `onEdit` - callback for edit button
- `onDuplicate` - callback for duplicate button
- `onDelete` - callback for delete button

**Display:**
- Activity name (bold, larger)
- Description (if exists)
- Last used: "X days ago" or "Never used"
- Indicators row (Sets, Splits, Metrics badges)
- Action buttons row (Edit, Duplicate, Delete)

### 3. Update ManageActivities Page
**File:** `/client/src/pages/ManageActivities.jsx`

**Changes:**
- Remove activity builder form (moved to modal)
- Add "Create Activity" button in top-right
- Change layout from 2-column grid to full-width grid
- Display activities as grid of ActivityCard components
- Add state for modal open/close
- Calculate "last instantiated" for each activity

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Manage Activities              [+ Create Activity]      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Activity │  │ Activity │  │ Activity │             │
│  │  Card 1  │  │  Card 2  │  │  Card 3  │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                          │
│  ┌──────────┐  ┌──────────┐                            │
│  │ Activity │  │ Activity │                            │
│  │  Card 4  │  │  Card 5  │                            │
│  └──────────┘  └──────────┘                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 4. Create Modal Wrapper
**File:** Use existing modal pattern or create new

**Features:**
- Overlay background
- Centered modal container
- Close on ESC key
- Close on overlay click
- Scrollable content if needed

### 5. Calculate Last Instantiated
**Logic:**
- Query sessions context for all sessions
- For each activity, find most recent session that uses it
- Display as relative time ("2 days ago") or "Never used"

## File Structure
```
client/src/
├── components/
│   ├── ActivityBuilder.jsx       (NEW - extracted form)
│   ├── ActivityCard.jsx           (NEW - tile display)
│   └── modals/
│       └── ActivityBuilderModal.jsx (NEW - modal wrapper)
├── pages/
│   └── ManageActivities.jsx       (MODIFIED - grid layout)
```

## Styling Approach
- Use CSS Grid for activity tiles (responsive: 1-3 columns based on screen width)
- Card styling: dark background, border, hover effect
- Modal: centered, max-width 800px, scrollable
- Button in top-right: absolute positioning or flex layout

## Data Flow
1. User clicks "Create Activity" → Open modal with empty form
2. User clicks "Edit" on card → Open modal with pre-filled form
3. User submits form → Save via context → Close modal → Refresh grid
4. User clicks "Duplicate" → Create copy → Refresh grid
5. User clicks "Delete" → Show confirmation → Delete → Refresh grid

## Testing Checklist
- [ ] Create new activity via modal
- [ ] Edit existing activity via modal
- [ ] Duplicate activity
- [ ] Delete activity
- [ ] Modal closes on ESC/overlay click
- [ ] Grid responsive on different screen sizes
- [ ] Last instantiated displays correctly
- [ ] Form validation works in modal
- [ ] Metric warning modal still works

## Estimated Complexity
- **ActivityBuilder component:** 1-2 hours
- **ActivityCard component:** 30 minutes
- **ManageActivities redesign:** 1 hour
- **Modal integration:** 30 minutes
- **Last instantiated logic:** 30 minutes
- **Testing & polish:** 1 hour

**Total:** ~4-5 hours
