# Track Splits Feature - Implementation Summary

## Overview
Implemented a comprehensive "splits" feature allowing users to track bilateral or multi-part activities (e.g., left/right leg exercises). This enables recording separate metrics for each split within a single activity.

## Completed Work

### 1. Database Schema ✅

**Files Modified:**
- `models.py` - Added `has_splits` to `ActivityDefinition`, created `SplitDefinition` model, added `split_definition_id` to `MetricValue`
- `python-scripts/migrate_add_splits.py` - Migration for `has_splits` and `split_definitions` table
- `python-scripts/migrate_add_split_to_metrics.py` - Migration for `split_definition_id` column

**Schema Changes:**
- `ActivityDefinition.has_splits` - Boolean flag for split-enabled activities
- `SplitDefinition` table - Stores split names and order (min 2, max 5 per activity)
- `MetricValue.split_definition_id` - Links metric values to specific splits (nullable for backward compatibility)

### 2. Backend API ✅

**Files Modified:**
- `blueprints/activities_api.py` - Updated `create_activity` and `update_activity` endpoints

**Features:**
- Create/update activities with split definitions
- Validate split count (min 2, max 5)
- Proper cascade handling for split deletion
- Split data included in activity serialization

### 3. Frontend - ManageActivities Page ✅

**Files Modified:**
- `client/src/pages/ManageActivities.jsx`

**Features:**
- "Track Splits" checkbox positioned between "Track Sets" and "Enable Metrics"
- Horizontal split input layout (3 per row with wrapping)
- Minimum 2 splits enforced (× buttons hidden when at minimum)
- Maximum 5 splits enforced (+ button hidden when at maximum)
- Split names fully customizable (default: "Split #1", "Split #2", etc.)
- Purple "Splits" badge (#7B5CFF) in saved activities list
- Splits preserved when editing/duplicating activities

**UI Behavior:**
- Splits section appears BEFORE Metrics section (matches checkbox order)
- "+ Add Split" button positioned after × button on last split
- Clean, intuitive interface matching existing design patterns

### 4. Frontend - SessionDetail & SessionActivityItem ✅

**Files Modified:**
- `client/src/pages/SessionDetail.jsx` - Added `has_splits` to activity initialization
- `client/src/components/SessionActivityItem.jsx` - Split-aware metric rendering

**Features:**
- **Sets-based activities**: Each set shows metrics grouped by split with visual separation
- **Non-sets activities**: Each split gets its own card with metrics displayed vertically
- Split labels use neutral gray (#aaa) color for consistency
- Backward compatible with non-split activities

**Data Structure:**
- Metrics stored with `split_id` when activity has splits
- Handlers updated to accept optional `splitId` parameter
- Proper filtering ensures only relevant metrics display

### 5. Frontend - Sessions Page ✅

**Files Modified:**
- `client/src/pages/Sessions.jsx`

**Features:**
- Split names displayed alongside metrics (e.g., "Left Leg - Reps: 10 reps")
- Metrics grouped by split in visual cards for better readability
- Vertical metric layout within splits prevents text scrunching
- Filters out non-split metrics when activity has splits (eliminates redundancy)
- Font sizes consistent with existing sets/metrics display

**Display Logic:**
- Split-enabled activities: Only show metrics with `split_id`
- Non-split activities: Only show metrics without `split_id`
- Grouped display for multiple metrics per split

### 6. Frontend - Analytics Page ✅

**Files Modified:**
- `client/src/pages/Analytics.jsx`
- `client/src/components/analytics/ScatterPlot.jsx`
- `client/src/components/analytics/LineGraph.jsx`

**Features:**
- **Split Selection Dropdown**: Appears next to "Sets Handling" control for split-enabled activities
- **Filter Options**: "All Splits (Combined)" + individual split names (e.g., "Left Leg", "Right Leg")
- **Auto-Reset**: Split selection resets to "All Splits" when changing activities
- **Dynamic Titles**: Chart titles update to show split name (e.g., "Leg Press - Left Leg - Metrics Analysis")
- **Comprehensive Filtering**: Both ScatterPlot and LineGraph filter metrics by `split_id`
- **Backward Compatible**: Non-split activities work normally, filtering out any split-specific data

**Data Filtering Logic:**
- Specific split selected: Only shows metrics with matching `split_id`
- "All Splits (Combined)": Shows all split-specific metrics together
- Non-split activities: Filters out metrics with `split_id` (backward compatibility)

**Chart Support:**
- ✅ Scatter Plot (2D/3D) with split filtering
- ✅ Line Graph with split filtering
- ✅ Works with "Top Set" and "Average" aggregation modes
- ✅ Proper handling of product metrics with splits

### 7. Testing & Validation ✅

**Verified:**
- Database migrations run successfully across all environments
- Activity creation/editing with splits works correctly
- Split data persists and loads properly
- Session recording with split-specific metrics functions as expected
- Split data displays correctly in session history
- Analytics charts filter and display split data correctly
- Split selection dropdown appears only for split-enabled activities
- Chart titles update dynamically with split names
- UI enforces min/max split constraints
- Backward compatibility maintained for non-split activities
- Font sizes and styling consistent across all pages
- No console errors or runtime issues

## Design Specifications

### Color Palette
- **Splits badge**: `#7B5CFF` (Nebula Violet - ManageActivities page only)
- **Split labels**: `#aaa` (Gray - SessionDetail and Sessions pages)

### Layout Rules
- **Split input width**: 150px
- **Splits per row**: 3 (with flexbox wrapping)
- **Min/Max splits**: 2-5 per activity
- **Section order**: Splits → Metrics (matches checkbox order)

### UI Patterns
- × button only visible when more than 2 splits exist
- "+ Add Split" button appears after × button on last split
- "+ Add Split" button hidden when 5 splits reached
- Splits section hidden when "Track Splits" unchecked
- Split dropdown only visible when split-enabled activity selected in Analytics

## Architecture Decisions

### Data Storage Strategy
**Chosen Approach**: Split-specific metric values via `split_definition_id` foreign key

**Rationale:**
- Clean, normalized data model
- Type-safe relationships
- Easy to query and aggregate
- Better for analytics and reporting
- Maintains referential integrity
- Enables efficient split-based filtering in Analytics

**Alternative Considered**: JSON storage in `session_data`
- Rejected due to poor queryability and lack of structure

## Migration Scripts

1. `python-scripts/migrate_add_splits.py` - Adds `has_splits` column and `split_definitions` table
2. `python-scripts/migrate_add_split_to_metrics.py` - Adds `split_definition_id` to `metric_values` table

Both scripts run across development, testing, and production environments.

## Production Database Migration

### Prerequisites
- Ensure all code changes are deployed to production
- Verify backend server is running in production environment
- Have database backup ready (automatic backups should be in place)

### Migration Steps

**Step 1: Run First Migration (Splits Tables)**
```bash
# SSH into production server or run locally if database is accessible
cd /path/to/fractal-goals

# Activate virtual environment
source fractal-goals-venv/bin/activate

# Run first migration script
python python-scripts/migrate_add_splits.py
```

**Expected Output:**
```
Running migration: Add splits support to activities
Environment: production
Database: fractal_goals_production.db
✓ Added has_splits column to activity_definitions
✓ Created split_definitions table
Migration completed successfully!
```

**Step 2: Run Second Migration (Metric Values)**
```bash
# Run second migration script
python python-scripts/migrate_add_split_to_metrics.py
```

**Expected Output:**
```
Running migration: Add split_definition_id to metric_values
Environment: production
Database: fractal_goals_production.db
✓ Added split_definition_id column to metric_values
✓ Created foreign key constraint
Migration completed successfully!
```

**Step 3: Verify Migration**
```bash
# Check database schema
sqlite3 fractal_goals_production.db

# Run verification queries
.schema activity_definitions
.schema split_definitions
.schema metric_values

# Verify columns exist
SELECT has_splits FROM activity_definitions LIMIT 1;
SELECT * FROM split_definitions LIMIT 1;
SELECT split_definition_id FROM metric_values LIMIT 1;

# Exit sqlite
.quit
```

**Step 4: Restart Production Server**
```bash
# Stop the production server
./shell-scripts/kill-all.sh production

# Start the production server
./shell-scripts/start-all.sh production
```

**Step 5: Verify Application**
- Navigate to production URL
- Go to Manage Activities page
- Verify "Track Splits" checkbox appears
- Create a test activity with splits
- Record a test session with split data
- View the session in Sessions page
- Check Analytics page for split filtering

### Verification Checklist
- [ ] Both migration scripts completed without errors
- [ ] Database schema includes new columns and tables
- [ ] Production server restarted successfully
- [ ] Frontend loads without errors
- [ ] "Track Splits" checkbox visible in Manage Activities
- [ ] Can create activities with splits
- [ ] Can record sessions with split data
- [ ] Split data displays correctly in Sessions page
- [ ] Split filtering works in Analytics page

### Rollback Procedure (If Needed)

**If migration fails or issues arise:**

1. **Restore from backup:**
   ```bash
   # Stop production server
   ./shell-scripts/kill-all.sh production
   
   # Restore database from backup
   cp /path/to/backup/fractal_goals_production.db.backup fractal_goals_production.db
   
   # Restart server
   ./shell-scripts/start-all.sh production
   ```

2. **Revert code deployment:**
   ```bash
   # Checkout previous commit
   git checkout <previous-commit-hash>
   
   # Rebuild frontend
   cd client
   npm run build
   cd ..
   
   # Restart server
   ./shell-scripts/kill-all.sh production
   ./shell-scripts/start-all.sh production
   ```

### Notes
- Migrations are **additive only** (no data loss)
- All new columns are **nullable** (backward compatible)
- Existing activities will have `has_splits = NULL` (treated as false)
- Existing metric values will have `split_definition_id = NULL` (non-split data)
- No downtime required - migrations can run while server is running
- Frontend gracefully handles both split and non-split activities

## Next Steps

### 1. Enhanced Split Analytics (Optional)
**Potential Enhancements:**
- Side-by-side split comparison charts
- Asymmetry detection and alerts (e.g., "Left leg 15% weaker than right")
- Split-specific trend lines and regression analysis
- Export split comparison data for external analysis
- Statistical significance testing for split differences

### 2. Enhanced Split Management
**Potential Improvements:**
- Warning when modifying splits on activities with existing session data
- Bulk edit split names across multiple activities
- Split templates/presets (e.g., "Left/Right", "Upper/Lower", etc.)
- Copy splits from one activity to another

### 3. Advanced Split Features
**Future Enhancements:**
- Split-based goals and targets
- Asymmetry detection and alerts
- Split comparison analytics
- Export split data for external analysis

## File Structure

```
fractal-goals/
├── models.py                                    # Updated with splits schema
├── blueprints/
│   └── activities_api.py                        # Split CRUD operations
├── python-scripts/
│   ├── migrate_add_splits.py                    # Initial splits migration
│   └── migrate_add_split_to_metrics.py          # Metric values migration
├── client/src/
│   ├── pages/
│   │   ├── ManageActivities.jsx                 # Split creation/editing UI
│   │   ├── SessionDetail.jsx                    # Split-aware session recording
│   │   ├── Sessions.jsx                         # Split data display
│   │   └── Analytics.jsx                        # Split filtering and analysis
│   └── components/
│       ├── SessionActivityItem.jsx              # Split-aware metric inputs
│       └── analytics/
│           ├── ScatterPlot.jsx                  # Split-filtered scatter plots
│           └── LineGraph.jsx                    # Split-filtered line graphs
└── implementation-docs/
    └── track-splits-feature.md                  # This document
```

## Testing Checklist

- [x] Database migrations run successfully
- [x] Create activity with splits
- [x] Edit activity splits
- [x] Duplicate activity with splits
- [x] Add/remove splits (respecting min/max)
- [x] Record session with split-enabled activity
- [x] View split data in session history
- [x] Splits badge displays correctly
- [x] UI enforces constraints
- [x] Backward compatibility maintained
- [x] Font sizes consistent
- [x] No redundant metric displays
- [x] Analytics page integration
- [x] Split filtering in Scatter Plot
- [x] Split filtering in Line Graph
- [x] Chart titles update with split names
- [ ] Split-based goal tracking
- [ ] Export split data

## Known Limitations

1. **Maximum 5 splits per activity** - Enforced at both UI and API levels
2. **Minimum 2 splits required** - Cannot create single-split activities
3. **No split reordering** - Splits maintain creation order
4. **Analytics not yet integrated** - Split data not yet visualized in Analytics page

## Rollback Plan

If issues arise:
1. Splits can be disabled per activity (uncheck "Track Splits")
2. Existing non-split activities unaffected
3. Database migrations are additive (nullable columns)
4. No breaking changes to existing functionality

---

**Status**: Splits feature fully implemented and integrated across all pages (ManageActivities, SessionDetail, Sessions, Analytics). Core functionality complete and tested. Ready for optional enhancements and advanced features.
