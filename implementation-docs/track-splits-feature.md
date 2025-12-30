# Track Splits Feature - Implementation Summary

## ✅ Completed (Session: 2025-12-29)

### 1. Database Schema Updates
- ✅ Added `has_splits` boolean column to `ActivityDefinition` model
- ✅ Created new `SplitDefinition` table with fields:
  - `id` (primary key)
  - `activity_id` (foreign key to activity_definitions)
  - `name` (split name, e.g., "Left", "Right")
  - `order` (display order)
  - `created_at` (timestamp)
- ✅ Added relationship between `ActivityDefinition` and `SplitDefinition`
- ✅ Updated `to_dict()` method to include `has_splits` and `split_definitions`
- ✅ Ran migration script across all environments (development, testing, production)

### 2. Backend API Updates
- ✅ Updated `activities_api.py` to import `SplitDefinition`
- ✅ Modified `create_activity` endpoint to:
  - Accept `has_splits` flag
  - Accept `splits` array in request body
  - Create `SplitDefinition` records (min 2, max 5 splits)
  - Validate split count limits
- ✅ Modified `update_activity` endpoint to:
  - Update `has_splits` flag
  - Handle split creation, updates, and deletion
  - Preserve split IDs when updating existing splits
  - Properly track split order

### 3. Frontend - ManageActivities Page
- ✅ Added state management for splits:
  - `hasSplits` boolean state
  - `splits` array state (default: 2 splits with names "Split #1", "Split #2")
- ✅ Added handler functions:
  - `handleAddSplit()` - adds new split (max 5)
  - `handleRemoveSplit()` - removes split (min 2)
  - `handleSplitChange()` - updates split name
- ✅ Added "Track Splits" checkbox positioned between "Track Sets" and "Enable Metrics"
- ✅ Added conditional "Splits (Min 2, Max 5)" form section with:
  - **Horizontal layout** with flexbox wrapping (3 splits per row)
  - Input fields (150px width) for split names
  - Remove (×) button for splits beyond minimum of 2
  - "+ Add Split" button that appears after the × button on the last split
  - Proper placeholder text (`Split #1`, `Split #2`, etc.)
- ✅ **Section ordering**: Splits section appears BEFORE Metrics section (matching checkbox order)
- ✅ Updated form submission to include splits data
- ✅ Updated activity loading to populate splits from existing activities
- ✅ Updated activity duplication to copy splits
- ✅ Added purple "Splits" badge (#7B5CFF - same as LongTermGoal) in saved activities list

### 4. UI/UX Features - Fully Implemented
- ✅ Splits section appears/disappears when checkbox is toggled
- ✅ Default 2 splits when enabled ("Split #1", "Split #2")
- ✅ Can add up to 5 splits total
- ✅ **Minimum of 2 splits enforced** - × buttons only appear when more than 2 splits exist
- ✅ Split names are fully customizable
- ✅ **Horizontal layout with wrapping** - splits flow left to right, wrapping after 3 per row
- ✅ **Proper button ordering** - "+ Add Split" button always appears after the × button
- ✅ Purple badge displays for activities with splits enabled
- ✅ Splits are preserved when editing activities
- ✅ Splits are copied when duplicating activities
- ✅ Clean, intuitive UI that matches the design of other form sections

### 5. Testing & Validation
- ✅ Database migration runs successfully across all environments
- ✅ Can create activity with splits enabled
- ✅ Can add/remove splits in the UI (respecting min/max limits)
- ✅ Can rename splits with custom names
- ✅ Splits badge appears correctly in activity list
- ✅ Can edit activity and modify splits
- ✅ Can duplicate activity with splits preserved
- ✅ UI properly enforces minimum of 2 splits
- ✅ UI properly enforces maximum of 5 splits
- ✅ Splits wrap to new row after 3 splits
- ✅ Button placement is correct (× before "+ Add Split")
- ✅ Section ordering is correct (Splits before Metrics)
- ✅ **User tested and confirmed working well**

## 🔄 Next Steps (To Be Implemented)

### 1. SessionDetail Page Updates - HIGH PRIORITY
The SessionDetail page needs to be updated to actually use splits when recording activity data.

**Required Changes:**
- When an activity has `has_splits: true`, the metric input UI should be duplicated for each split
- For example, if an activity has splits ["Left Leg", "Right Leg"] and metrics ["Reps", "Weight"]:
  - Show "Left Leg - Reps" and "Left Leg - Weight" inputs
  - Show "Right Leg - Reps" and "Right Leg - Weight" inputs
- Store split data in the activity instance or metric values
- This will require additional database schema changes to link metric values to specific splits

**Implementation Approach:**
1. Add `split_definition_id` column to `MetricValue` table (nullable for backward compatibility)
2. Update SessionDetail UI to render split-specific metric inputs
3. Update metric value creation to include split association
4. Handle both split and non-split activities in the same UI

**Files to Update:**
- `/models.py` - Add `split_definition_id` to `MetricValue`
- `/blueprints/sessions_api.py` - Handle split data in session endpoints
- `/client/src/pages/SessionDetail.jsx` - Render split-specific inputs
- Create new migration script for MetricValue schema change

### 2. Analytics Page Updates
The Analytics page should display split data when analyzing activities.

**Required Changes:**
- Show separate charts/data for each split
- Allow filtering/comparing between splits
- Display split names in legends and labels
- Calculate statistics per split (e.g., "Left Leg average reps vs Right Leg average reps")

**Files to Update:**
- `/client/src/pages/Analytics.jsx`

### 3. Sessions Page Updates
The Sessions page (session history/list) should display split information.

**Required Changes:**
- Show split data when viewing completed sessions
- Display which splits were tracked for each activity
- Show summary statistics per split

**Files to Update:**
- `/client/src/pages/Sessions.jsx`

### 4. Data Storage Strategy - DECISION NEEDED

**Option A: Split-Specific Metric Values (RECOMMENDED)**
- Add `split_definition_id` to `MetricValue` table
- Each metric value is associated with a specific split
- **Pros:** 
  - Clean, normalized data model
  - Easy to query and aggregate
  - Type-safe relationships
  - Better for analytics
- **Cons:** 
  - Requires schema migration
  - More complex queries for non-split activities

**Option B: Store Split Data in JSON**
- Store split information in the existing `session_data` JSON field
- **Pros:** 
  - No schema changes needed
  - Flexible structure
- **Cons:** 
  - Harder to query
  - Less structured
  - Difficult to aggregate across sessions
  - Not ideal for analytics

**Recommendation:** **Option A** - The benefits of a clean data model far outweigh the migration effort. This will make analytics and querying much easier in the long run.

## Migration Scripts

### Completed
- `/python-scripts/migrate_add_splits.py` - Adds `has_splits` and `split_definitions` table

### Needed
- Migration to add `split_definition_id` to `MetricValue` table (for SessionDetail integration)

## Key Files Modified

### Backend
1. `/models.py` - Database models (ActivityDefinition, SplitDefinition)
2. `/blueprints/activities_api.py` - Activity CRUD endpoints with split support

### Frontend
3. `/client/src/pages/ManageActivities.jsx` - Activity builder UI with splits

### Scripts
4. `/python-scripts/migrate_add_splits.py` - Database migration

## Design Specifications

### Color Reference
- **Splits badge color:** `#7B5CFF` (Nebula Violet - same as LongTermGoal)
- Sets badge color: `#ff9800` (Orange)
- Multiplicative badge color: `#f44336` (Red)

### Layout Specifications
- **Split input width:** 150px
- **Splits per row:** 3 (with flexbox wrapping)
- **Minimum splits:** 2
- **Maximum splits:** 5
- **Section order:** Splits → Metrics (matches checkbox order)

### UI Behavior
- × button only appears when more than 2 splits exist
- "+ Add Split" button appears after × button on last split
- "+ Add Split" button hidden when 5 splits reached
- Splits section hidden when "Track Splits" unchecked

## Notes for Next Session

### Immediate Next Steps
1. **Add `split_definition_id` to MetricValue table**
   - Create migration script
   - Update MetricValue model
   - Make column nullable for backward compatibility

2. **Update SessionDetail.jsx**
   - Detect if activity has splits
   - Render split-specific metric inputs
   - Update metric value creation logic
   - Test with both split and non-split activities

3. **Test end-to-end flow**
   - Create activity with splits
   - Record session with split data
   - Verify data is stored correctly
   - View session in Sessions page
   - Analyze in Analytics page

### Questions to Consider
- Should we allow changing splits on an activity that already has recorded data?
- How should we handle activities where splits are added/removed after data exists?
- Should we show a warning when modifying splits on activities with existing sessions?

### Testing Priorities
1. Create and save activity with splits ✅
2. Record session with split-enabled activity ⏳
3. View recorded split data ⏳
4. Edit activity splits after data exists ⏳
5. Analytics with split data ⏳
