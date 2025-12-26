# Time Tracking Implementation Plan

## Overview
Add comprehensive time tracking for practice sessions, sections, and activity instances with start/stop/duration functionality.

## Data Model Changes

### 1. ActivityInstance Model (models.py)
Add fields:
- `time_start`: DateTime (nullable) - when user clicks "Start"
- `time_stop`: DateTime (nullable) - when user clicks "Stop"
- `duration_seconds`: Integer (nullable) - calculated from stop - start

### 2. Session Data Structure (JSON in session_data)
Each section will track:
```json
{
  "sections": [
    {
      "name": "Warm-up",
      "duration_minutes": 10,  // planned
      "actual_duration_minutes": 12,  // manual entry (deprecated)
      "time_start": "2025-12-25T10:00:00",  // earliest activity start
      "time_stop": "2025-12-25T10:12:00",   // latest activity stop
      "duration_seconds": 720,  // calculated sum of activities
      "exercises": [...]
    }
  ]
}
```

### 3. PracticeSession Model
Already has `duration_minutes` field - will be calculated from session_data sections

## Backend Changes

### 1. Database Migration
- Add columns to `activity_instances` table
- Update `to_dict()` methods to include time fields

### 2. API Endpoints
New/Updated endpoints:
- `POST /api/<root_id>/activity-instances/<instance_id>/start` - Start timer
- `POST /api/<root_id>/activity-instances/<instance_id>/stop` - Stop timer
- `PUT /api/<root_id>/sessions/<session_id>` - Update to calculate rollups

### 3. Calculation Logic
- Activity duration: `time_stop - time_start` in seconds
- Section time_start: `min(activity.time_start for all activities)`
- Section time_stop: `max(activity.time_stop for all activities)`
- Section duration: `sum(activity.duration_seconds for all activities)`
- Session duration: `sum(section.duration_seconds for all sections)`

## Frontend Changes

### 1. SessionActivityItem Component
Add to top-right of each activity card:
- Start button (green play icon)
- Stop button (red stop icon)
- Duration display (MM:SS format)
- Delete button (X) - already exists

### 2. SessionDetail Page
- Calculate and display section durations from activities
- Auto-update section time_start/time_stop based on activities
- When "Mark Complete" clicked, auto-stop all running timers

### 3. Sessions Page (Table View)
- Replace manual duration column with calculated duration from session_data
- Display in HH:MM format

### 4. Section Display
- Show duration in the section header (replacing manual input)
- Format: "Duration: 12:30 (planned: 10:00)"

## Implementation Steps

1. ✅ Create implementation plan
2. Update database models
3. Create migration script
4. Update backend API endpoints
5. Update SessionActivityItem component
6. Update SessionDetail page logic
7. Update Sessions page display
8. Test complete workflow

## Time Format Standards
- Storage: ISO 8601 datetime strings
- Display: 
  - Activities: MM:SS (e.g., "05:30")
  - Sections: MM:SS (e.g., "12:45")
  - Sessions: HH:MM (e.g., "1:15")
