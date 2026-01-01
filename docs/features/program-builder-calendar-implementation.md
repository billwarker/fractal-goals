# Program Builder Calendar Implementation Plan

## Overview
This document outlines the implementation plan for adding a calendar-based training block system to the Program Builder modal.

## Current State (Completed)
✅ Installed `react-big-calendar` and `moment`  
✅ Added `trainingBlocks` array to program data structure  
✅ Created `calculateWeeks()` function  
✅ Added training block management functions  
✅ Updated step counter to "3 steps"  
✅ Added week calculation display in Step 1  

## New Program Builder Flow

### Step 1: Program Details (CURRENT - No Changes Needed)
- Program Name
- Description (optional)
- Target Goals (categorized by type with cosmic colors)
- Date Range (Start/End dates)
- **Week Calculation Display** (shows total weeks in program)

### Step 2: Training Blocks (NEW - TO BE IMPLEMENTED)
This step replaces the current Step 2 and introduces a visual calendar-based approach.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Training Blocks                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Calendar View (react-big-calendar)                  │   │
│  │  - Shows program date range                          │   │
│  │  - Displays created training blocks as events        │   │
│  │  - Click to select/edit blocks                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Block Management Panel                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [+ Add Training Block]                              │   │
│  │                                                       │   │
│  │  Block 1: Week 1                                     │   │
│  │  ├─ Start: Jan 1, 2025                               │   │
│  │  ├─ End: Jan 7, 2025                                 │   │
│  │  ├─ Color: [color picker]                            │   │
│  │  └─ [Edit] [Delete]                                  │   │
│  │                                                       │   │
│  │  Block 2: Week 2                                     │   │
│  │  └─ ...                                               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Calendar displays the full program date range
- Users click "Add Training Block" to create a new week
- Each block has:
  - Name (default: "Week 1", "Week 2", etc.)
  - Start Date (date picker)
  - End Date (date picker)
  - Color (color picker for visual distinction)
- Blocks appear as events on the calendar
- Users can edit block details in the panel
- Blocks can be deleted
- Validation: blocks cannot overlap

### Step 3: Weekly Schedule (MOVED FROM STEP 2)
This is the current Step 2 content, moved to Step 3.

**Changes needed:**
- Instead of a single weekly schedule, users will assign sessions **per training block**
- UI shows a dropdown/selector to choose which training block to configure
- Each block has its own weekly schedule
- The schedule UI remains the same (Monday-Sunday + Daily)

**Updated Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Weekly Training Schedule                                    │
│                                                              │
│  Configure schedule for: [Dropdown: Week 1 ▼]               │
│                                                              │
│  [Current weekly schedule UI - unchanged]                   │
│  - Available Session Templates                              │
│  - Monday, Tuesday, ... Sunday, Daily sections              │
│  - Drag/drop or select templates                            │
└─────────────────────────────────────────────────────────────┘
```

## Data Structure Changes

### Current Structure
```javascript
{
  name: "Program Name",
  selectedGoals: ["goal-id-1", "goal-id-2"],
  startDate: "2025-01-01",
  endDate: "2025-03-31",
  weeklySchedule: {
    monday: [template1, template2],
    tuesday: [],
    // ... etc
  }
}
```

### New Structure
```javascript
{
  name: "Program Name",
  description: "Optional description",
  selectedGoals: ["goal-id-1", "goal-id-2"],
  startDate: "2025-01-01",
  endDate: "2025-03-31",
  trainingBlocks: [
    {
      id: "block-1",
      name: "Week 1",
      startDate: "2025-01-01",
      endDate: "2025-01-07",
      color: "#3A86FF",
      weeklySchedule: {
        monday: [template1],
        tuesday: [template2],
        wednesday: [],
        thursday: [template1],
        friday: [],
        saturday: [template3],
        sunday: [],
        daily: [template4]
      }
    },
    {
      id: "block-2",
      name: "Week 2",
      startDate: "2025-01-08",
      endDate: "2025-01-14",
      color: "#7B5CFF",
      weeklySchedule: {
        // ... different schedule for week 2
      }
    }
  ]
}
```

## Implementation Steps

### 1. Create Step 2 UI (Training Blocks)
**File:** `client/src/components/modals/ProgramBuilder.jsx`

**Add after Step 1 content:**
```javascript
{step === 2 && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '600px' }}>
    {/* Calendar Section */}
    <div style={{ flex: 1, background: '#2a2a2a', borderRadius: '8px', padding: '16px' }}>
      <Calendar
        localizer={localizer}
        events={programData.trainingBlocks.map(block => ({
          id: block.id,
          title: block.name,
          start: new Date(block.startDate),
          end: new Date(block.endDate),
          resource: block
        }))}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '100%' }}
        views={['month']}
        defaultView="month"
        min={programData.startDate ? new Date(programData.startDate) : new Date()}
        max={programData.endDate ? new Date(programData.endDate) : new Date()}
        eventPropGetter={(event) => ({
          style: {
            backgroundColor: event.resource.color,
            borderRadius: '4px',
            border: 'none'
          }
        })}
      />
    </div>

    {/* Block Management Panel */}
    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
      <button
        onClick={addTrainingBlock}
        style={{
          width: '100%',
          padding: '12px',
          background: '#3A86FF',
          border: 'none',
          borderRadius: '6px',
          color: 'white',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: '12px'
        }}
      >
        + Add Training Block
      </button>

      {/* List of blocks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {programData.trainingBlocks.map(block => (
          <div
            key={block.id}
            style={{
              background: '#1e1e1e',
              border: `2px solid ${block.color}`,
              borderRadius: '6px',
              padding: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <input
                type="text"
                value={block.name}
                onChange={(e) => updateTrainingBlock(block.id, { name: e.target.value })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  flex: 1
                }}
              />
              <button
                onClick={() => removeTrainingBlock(block.id)}
                style={{
                  background: '#d32f2f',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Delete
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: '8px', marginTop: '8px' }}>
              <input
                type="date"
                value={block.startDate || ''}
                onChange={(e) => updateTrainingBlock(block.id, { startDate: e.target.value })}
                style={{
                  background: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  color: 'white',
                  padding: '6px',
                  fontSize: '12px'
                }}
              />
              <input
                type="date"
                value={block.endDate || ''}
                onChange={(e) => updateTrainingBlock(block.id, { endDate: e.target.value })}
                style={{
                  background: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  color: 'white',
                  padding: '6px',
                  fontSize: '12px'
                }}
              />
              <input
                type="color"
                value={block.color}
                onChange={(e) => updateTrainingBlock(block.id, { color: e.target.value })}
                style={{
                  width: '100%',
                  height: '30px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
)}
```

### 2. Update Step 3 (Weekly Schedule)
**File:** `client/src/components/modals/ProgramBuilder.jsx`

**Changes:**
- Change `{step === 2 &&` to `{step === 3 &&`
- Add block selector at the top
- Update state management to handle per-block schedules

**Add state for selected block:**
```javascript
const [selectedBlockId, setSelectedBlockId] = useState(null);
```

**Add block selector UI:**
```javascript
{step === 3 && (
  <div>
    {/* Block Selector */}
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontWeight: 500 }}>
        Configure Schedule For:
      </label>
      <select
        value={selectedBlockId || ''}
        onChange={(e) => setSelectedBlockId(e.target.value)}
        style={{
          width: '100%',
          padding: '12px',
          background: '#2a2a2a',
          border: '1px solid #444',
          borderRadius: '6px',
          color: 'white',
          fontSize: '14px'
        }}
      >
        <option value="">Select a training block...</option>
        {programData.trainingBlocks.map(block => (
          <option key={block.id} value={block.id}>
            {block.name} ({block.startDate} - {block.endDate})
          </option>
        ))}
      </select>
    </div>

    {/* Show schedule UI only if a block is selected */}
    {selectedBlockId && (
      // ... existing weekly schedule UI ...
    )}
  </div>
)}
```

### 3. Update Session Assignment Logic
**Changes needed:**
- Instead of updating `programData.weeklySchedule`, update the specific block's schedule
- Find the selected block and update its `weeklySchedule` property

**Example:**
```javascript
const assignTemplateToDay = (day, template) => {
  setProgramData({
    ...programData,
    trainingBlocks: programData.trainingBlocks.map(block =>
      block.id === selectedBlockId
        ? {
            ...block,
            weeklySchedule: {
              ...block.weeklySchedule,
              [day]: [...block.weeklySchedule[day], template]
            }
          }
        : block
    )
  });
};
```

### 4. Update Modal Width
**File:** `client/src/components/modals/ProgramBuilder.jsx`

Change modal width logic:
```javascript
maxWidth: step === 1 ? '600px' : '1200px',
```

This gives more space for the calendar in steps 2 and 3.

### 5. Add Calendar Styling
**File:** Create `client/src/components/modals/ProgramBuilder.css` (optional)

Or add inline styles to customize the calendar appearance to match the dark theme.

## Testing Checklist
- [ ] Step 1: Can create program with name, goals, and dates
- [ ] Step 1: Week calculation displays correctly
- [ ] Step 2: Can add training blocks
- [ ] Step 2: Blocks appear on calendar
- [ ] Step 2: Can edit block name, dates, and color
- [ ] Step 2: Can delete blocks
- [ ] Step 2: Calendar displays correct date range
- [ ] Step 3: Can select a training block
- [ ] Step 3: Can assign session templates to days
- [ ] Step 3: Each block maintains its own schedule
- [ ] Navigation: Can go back/forward between steps
- [ ] Save: Program data includes all blocks with their schedules
- [ ] Backend: Data structure is saved correctly to database

## Database Considerations
The backend already supports storing JSON in the `weekly_schedule` field. With the new structure, this field will contain the `trainingBlocks` array instead of a single weekly schedule.

**No backend changes needed** - the existing `Program` model's `weekly_schedule` TEXT field can store the entire `trainingBlocks` array as JSON.

## Next Steps
1. Review this plan
2. Implement Step 2 UI (calendar + blocks)
3. Update Step 3 UI (block selector + schedule)
4. Update state management for per-block schedules
5. Test the complete flow
6. Adjust styling as needed
