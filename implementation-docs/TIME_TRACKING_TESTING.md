# Time Tracking Implementation - Testing Checklist

## ✅ Completed Implementation

### Backend
- [x] Added `time_start`, `time_stop`, `duration_seconds` fields to ActivityInstance model
- [x] Updated `to_dict()` method to include time fields
- [x] Created and ran database migration
- [x] Added API endpoints:
  - `POST /<root_id>/activity-instances/<instance_id>/start`
  - `POST /<root_id>/activity-instances/<instance_id>/stop`
  - `GET /<root_id>/activity-instances`

### Frontend API
- [x] Added `startActivityTimer()` method
- [x] Added `stopActivityTimer()` method
- [x] Added `getActivityInstances()` method

### UI Components
- [x] **SessionActivityItem**: Added timer controls
  - Start button (green play icon)
  - Stop button (red stop icon)
  - Duration display (MM:SS format)
  - Running indicator
  - Delete button (X)

- [x] **SessionDetail Page**:
  - Timer action handling with API calls
  - Auto-stop all running timers when completing session
  - Section duration calculation from activities
  - Replaced manual duration input with calculated display

- [x] **Sessions Page**:
  - Session duration calculated from all activity instances (HH:MM format)
  - Section duration calculated from activity instances (MM:SS format)
  - Activity duration display in activity cards (MM:SS format)

## Testing Steps

1. **Navigate to a practice session detail page**
   - URL: `http://localhost:5173/<root_id>/session/<session_id>`

2. **Test Activity Timer Controls**
   - Click "Start" button on an activity → Should show "Running..." and stop button
   - Click "Stop" button → Should show duration in MM:SS format
   - Verify duration persists after page refresh

3. **Test Section Duration Calculation**
   - Start and stop multiple activities in a section
   - Verify section header shows sum of activity durations

4. **Test Session Completion**
   - Start timers on multiple activities
   - Click "Mark Complete" button
   - Verify all running timers are stopped automatically

5. **Test Sessions List Page**
   - Navigate to `/sessions` page
   - Verify session duration shows total from all activities (HH:MM)
   - Verify section durations show calculated values (MM:SS)
   - Verify individual activity durations appear in activity cards

## Time Format Standards
- **Activities**: MM:SS (e.g., "05:30")
- **Sections**: MM:SS (e.g., "12:45")
- **Sessions**: HH:MM (e.g., "1:15")

## Known Limitations
- Timer runs in backend only (no live client-side countdown)
- Duration calculated only when timer is stopped
- No edit/reset functionality for durations (would need additional endpoints)
