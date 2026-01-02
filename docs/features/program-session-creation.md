# Program-Based Session Creation Feature

**Date:** January 2, 2026  
**Status:** ✅ Complete  
**Developer:** AI Agent

---

## Overview

Enhanced the session creation flow to support creating practice sessions directly from active program days. This creates a seamless integration between the Programs feature and session creation, allowing users to easily follow their training program schedule.

## User Story

**As a user**, when I have an active training program with scheduled sessions:
- I want to create a practice session from my program's scheduled day
- So that I can easily follow my program without manually selecting templates
- And track which sessions belong to which program/block/day

## Implementation

### Backend Changes

#### New API Endpoint: `GET /api/<root_id>/programs/active-days`

**Purpose:** Returns program days from active programs where the current date falls within the block's date range.

**Response Format:**
```json
[
  {
    "program_id": "uuid",
    "program_name": "Test Program",
    "block_id": "uuid",
    "block_name": "Block 1",
    "block_color": "#3A86FF",
    "day_id": "uuid",
    "day_name": "Monday",
    "day_number": 1,
    "day_date": "2026-01-02",
    "sessions": [
      {
        "scheduled_session_id": "uuid",
        "template_id": "uuid",
        "template_name": "Upper Body Day 1",
        "template_description": "...",
        "template_data": { /* full template data */ }
      }
    ]
  }
]
```

**Logic:**
1. Queries all active programs (`is_active=True`) for the fractal
2. Finds blocks where `start_date <= today <= end_date`
3. Finds days within those blocks that have scheduled sessions
4. Filters for sessions with templates that aren't completed
5. Returns full context including program/block/day/session details

**File:** `/blueprints/programs_api.py` (line 562)

### Frontend Changes

#### Updated Component: `CreateSession.jsx`

**New Flow:**

1. **Step 0: Choose Session Source** (conditional)
   - Only shown if both program days AND templates are available
   - User selects: "From Active Program" or "From Template"
   - Auto-skipped if only one option is available

2. **Step 1: Select Source**
   - **Option A:** Select a program day (shows program context, auto-loads template)
   - **Option B:** Select a template manually (original flow)

3. **Step 2: Associate with Goals** (unchanged)
   - Select one or more short-term goals

4. **Step 3: Create Session** (enhanced)
   - Shows selected template name
   - Shows program context if from program day
   - Creates session with program metadata

**Key Features:**
- Smart UI that adapts based on available options:
  - **Multiple programs**: Shows program selector in Step 0
  - **Single program + templates**: Shows source selector (Program vs Template)
  - **No programs**: Skips directly to template selection
- **Persistent Step 0**: Source/program selection always visible, no back buttons needed
- Visual program context (program name, block name/color, day info)
- **Multi-session day support**: Expandable picker when day has multiple templates
- Program metadata saved in session for tracking
- Graceful fallback to template selection
- **Fractal-scoped**: All programs filtered by current root_id

**File:** `/client/src/pages/CreateSession.jsx` (complete rewrite)

#### Updated API Helper: `api.js`

Added new function:
```javascript
getActiveProgramDays: (rootId) =>
    axios.get(`${API_BASE}/${rootId}/programs/active-days`)
```

**File:** `/client/src/utils/api.js`

### Session Metadata Enhancement

Sessions created from program days now include `program_context` in their `session_data`:

```json
{
  "template_id": "uuid",
  "template_name": "Upper Body Day 1",
  "program_context": {
    "program_id": "uuid",
    "program_name": "Test Program",
    "block_id": "uuid",
    "block_name": "Block 1",
    "day_id": "uuid",
    "day_name": "Monday"
  },
  "sections": [ /* ... */ ]
}
```

This allows for:
- Tracking which sessions belong to which program
- Analytics on program adherence
- Future features like "mark program day as complete"

## User Experience

### Scenario 1: User has multiple active programs
1. Navigate to "Create Session" page
2. See "Choose a Program" selector in Step 0
3. See list of programs (e.g., "Strength Training", "Flexibility Program")
4. Click desired program
5. Program highlights, Step 1 appears showing that program's days
6. Select specific day and session
7. Select goal(s)
8. Create session

### Scenario 1b: User wants to switch programs
1. In Step 0, click different program
2. Previous program unhighlights
3. New program highlights
4. Step 1 updates to show new program's days
5. Continue with day/session selection

### Scenario 1c: User wants manual template instead
1. Click "📋 Select Template Manually Instead" button in Step 0
2. Step 1 switches to template selection
3. Continue with template selection

### Scenario 2: User has active program with single-session day
1. Navigate to "Create Session" page
2. See program day option highlighted
3. Select the program day (template auto-selected)
4. Select goal(s)
5. Create session

### Scenario 3: User has active program with multi-session day
1. Navigate to "Create Session" page
2. Choose "From Active Program" (if both options available)
3. Select the program day
4. See expandable list of sessions for that day
5. Select specific session/template from the day
6. Select goal(s)
7. Create session

### Scenario 4: User wants to change source selection
1. Navigate to "Create Session" page
2. Step 0 shows "From Program" vs "From Template"
3. Click "From Program"
4. See program days in Step 1
5. Change mind, click "From Template" in Step 0
6. Step 1 updates to show templates
7. Continue with template selection

### Scenario 5: User has active program but wants different template
1. Navigate to "Create Session" page
2. Choose "From Template" option in Step 0
3. Select any template manually
4. Select goal(s)
5. Create session

### Scenario 6: User has no active program
1. Navigate to "Create Session" page
2. See only template selection (original flow)
3. Select template
4. Select goal(s)
5. Create session

## Benefits

1. **Seamless Program Integration**
   - Users can easily follow their program schedule
   - No need to remember which template to use on which day

2. **Better Tracking**
   - Sessions maintain link to program structure
   - Enables future analytics on program adherence
   - Can track completion of program days

3. **Flexible Workflow**
   - Still allows manual template selection
   - Gracefully handles edge cases (no program, no templates)
   - Smart UI adapts to available options

4. **Enhanced Context**
   - Visual program/block/day information
   - Color-coded blocks for easy identification
   - Clear indication of program vs. manual sessions

## Testing

### Backend Testing
```bash
# Test the new endpoint
curl "http://localhost:8001/api/<root_id>/programs/active-days"

# Expected: Array of program days for today's date
# Empty array if no active programs or no matching days
```

### Frontend Testing
1. Create an active program with blocks
2. Add a day with a session template to a block containing today's date
3. Navigate to "Create Session" page
4. Verify program day appears in the list
5. Select program day and verify template is auto-loaded
6. Create session and verify program context is saved

### Edge Cases Tested
- ✅ No active programs → shows only template selection
- ✅ No templates → shows only program day selection
- ✅ Single program + templates → shows source choice (Program vs Template)
- ✅ Multiple programs → shows program selector
- ✅ Multiple programs + templates → shows program selector with manual template option
- ✅ Program day selected → template auto-populated
- ✅ Manual template selected → program context cleared
- ✅ Session created with program context → metadata saved correctly
- ✅ Multi-session day → shows expandable session picker
- ✅ Single-session day → auto-selects template
- ✅ Switching programs → clears day/session selections, updates Step 1
- ✅ Switching sources → clears all selections, updates Step 1
- ✅ Hover effects → visual feedback on interactive elements
- ✅ Fractal scoping → only shows programs for current root_id

## Benefits

1. **Seamless Program Integration**
   - Users can easily follow their program schedule
   - No need to remember which template to use on which day
   - Support for complex programs with multiple daily sessions
   - Support for multiple concurrent programs within a fractal

2. **Better Tracking**
   - Sessions maintain link to program structure
   - Enables future analytics on program adherence
   - Can track completion of program days
   - Scheduled session ID saved for precise tracking
   - Program context includes full hierarchy (program/block/day)

3. **Flexible Workflow**
   - Still allows manual template selection
   - Gracefully handles edge cases (no program, no templates, multiple programs)
   - Smart UI adapts to available options
   - Persistent Step 0 allows easy switching without navigation

4. **Enhanced Context**
   - Visual program/block/day information
   - Color-coded blocks for easy identification
   - Clear indication of program vs. manual sessions
   - Multi-session days clearly marked with count

5. **Improved UX**
   - Hover effects provide visual feedback
   - Nested UI for multi-session selection
   - Auto-selection for single-session days
   - Step 0 always visible when choices exist
   - No back buttons needed - just click different option
   - Smooth transitions on all state changes

6. **Data Integrity**
   - All data properly scoped to current fractal
   - No cross-fractal data leakage
   - Proper state management prevents inconsistencies

## Future Enhancements

Potential improvements for future iterations:

1. **Mark Program Day as Complete**
   - After creating session from program day, mark the scheduled session as complete
   - Visual indicator on program calendar

2. **Program Adherence Analytics**
   - Track % of program days completed
   - Show missed vs. completed sessions
   - Visualize program progress

3. **~~Multi-Session Days~~** ✅ **IMPLEMENTED**
   - ~~Support days with multiple scheduled sessions~~
   - ~~Allow creating all sessions at once or individually~~

4. **Batch Session Creation**
   - Create all sessions for a multi-session day at once
   - Quick "complete program day" workflow

5. **Program Recommendations**
   - Suggest which program day to do based on history
   - Smart scheduling based on rest days and progression

6. **Template Variations**
   - Allow slight modifications to program templates
   - Save variations for future use

## Files Modified

- `/blueprints/programs_api.py` - New endpoint
- `/client/src/utils/api.js` - New API helper
- `/client/src/pages/CreateSession.jsx` - Complete rewrite
- `/index.md` - Updated documentation

## Related Features

- Programs feature (blocks, days, scheduled sessions)
- Session templates
- Practice session creation
- Goal association

---

**Next Steps:**
- User testing and feedback
- Consider implementing "mark as complete" functionality
- Explore program adherence analytics
