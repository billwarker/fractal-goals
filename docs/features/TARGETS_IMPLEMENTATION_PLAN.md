# Activity Targets & Goal Completion Implementation Plan

## Overview
Add the ability to set activity targets on goals, where completing target activities automatically marks the goal as complete. Display targets in the goal inspector sidebar.

## Requirements

### 1. Activity Targets
- **Definition**: An activity instance with specific metric values that serves as a completion target
- **Structure**: 
  - Activity definition reference (which activity)
  - Target metric values (e.g., "Bench Press: 225 lbs x 5 reps")
  - Optional: Sets count if activity has sets
- **Behavior**: When an activity instance in a practice session matches or exceeds the target, the associated goal is marked complete

### 2. Goal Targets Attribute
- **Location**: Added to Goal model
- **Type**: JSON array of target objects
- **Format**:
  ```json
  {
    "targets": [
      {
        "id": "target-uuid",
        "activity_id": "activity-def-uuid",
        "name": "Bench Press Target",
        "description": "Press 225 lbs for 5 reps",
        "has_sets": true,
        "target_sets": 1,
        "metrics": [
          {"metric_id": "weight-metric-id", "value": 225},
          {"metric_id": "reps-metric-id", "value": 5}
        ]
      }
    ]
  }
  ```

### 3. Goal Inspector UI
- **Location**: Right sidebar on FractalGoals page when a goal is selected
- **New Section**: "Targets" section below goal details
- **Display**: Activity cards similar to Sessions page format
  - Activity name
  - Metric values with units
  - Completion status (✓ if met, ○ if not)
  - Edit/Delete buttons

## Data Model Changes

### Goal Model (models.py)
```python
class Goal(Base):
    # ... existing fields ...
    targets = Column(Text, nullable=True)  # JSON string
    
    def to_dict(self):
        return {
            # ... existing fields ...
            "targets": json.loads(self.targets) if self.targets else []
        }
```

### Migration
- Add `targets` column to `goals` table (TEXT, nullable)

## Backend Changes

### API Endpoints (blueprints/api.py)
1. **Update Goal Endpoint** - Modify to accept targets
   - `PUT /<root_id>/goals/<goal_id>`
   - Accept `targets` in request body
   - Validate target structure

2. **Check Target Completion** (new logic)
   - When activity instance is saved/updated
   - Compare against all goals' targets
   - Auto-mark goal as complete if target met

### Target Matching Logic
```python
def check_target_completion(activity_instance, target):
    """
    Check if an activity instance meets a target.
    Returns True if all metrics meet or exceed target values.
    """
    # Match activity definition
    if activity_instance.activity_definition_id != target['activity_id']:
        return False
    
    # Check each metric
    for target_metric in target['metrics']:
        instance_metric = find_metric(activity_instance, target_metric['metric_id'])
        if not instance_metric or instance_metric.value < target_metric['value']:
            return False
    
    return True
```

## Frontend Changes

### 1. Goal Inspector Sidebar (FractalGoals.jsx)

**Add Targets Section:**
```jsx
{/* Targets Section */}
{viewingGoal && (
    <div style={{ marginTop: '20px' }}>
        <h3>Targets</h3>
        <button onClick={() => setShowAddTarget(true)}>+ Add Target</button>
        
        {viewingGoal.targets?.map(target => (
            <TargetCard
                key={target.id}
                target={target}
                activityDefinitions={activities}
                onEdit={() => handleEditTarget(target)}
                onDelete={() => handleDeleteTarget(target.id)}
            />
        ))}
    </div>
)}
```

### 2. TargetCard Component (new)

**File**: `client/src/components/TargetCard.jsx`

**Purpose**: Display a target activity with metrics (similar to activity cards in Sessions)

**Features**:
- Activity name
- Metric values with units
- Completion status indicator
- Edit/Delete buttons

### 3. Add/Edit Target Modal (new)

**File**: `client/src/components/AddTargetModal.jsx`

**Purpose**: Create or edit activity targets

**Features**:
- Activity selector dropdown
- Metric value inputs (based on selected activity's metrics)
- Sets count (if activity has sets)
- Save/Cancel buttons

### 4. Target Completion Checking

**When**: After saving session data with activity instances

**Logic**:
1. Get all goals for the current fractal
2. For each goal with targets:
   - Check if any activity instance meets the target
   - If yes, mark goal as complete
3. Update UI to reflect completion

## UI Flow

### Adding a Target to a Goal

1. User selects a goal in the fractal tree
2. Goal inspector sidebar opens
3. User scrolls to "Targets" section
4. User clicks "+ Add Target"
5. Modal opens with:
   - Activity dropdown (populated from saved activities)
   - Metric inputs (dynamically shown based on selected activity)
   - Sets count (if applicable)
6. User fills in target values
7. User clicks "Save"
8. Target is added to goal's targets array
9. Goal is updated via API
10. Target card appears in sidebar

### Target Display in Sidebar

```
┌─────────────────────────────────────┐
│ TARGETS                             │
│ ┌─────────────────────────────────┐ │
│ │ Bench Press                  ○  │ │
│ │ Weight: 225 lbs                 │ │
│ │ Reps: 5                         │ │
│ │ [Edit] [Delete]                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 5K Run                       ✓  │ │
│ │ Time: 25:00 min                 │ │
│ │ [Edit] [Delete]                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [+ Add Target]                      │
└─────────────────────────────────────┘
```

### Automatic Goal Completion

1. User completes a practice session
2. User enters activity metrics (e.g., Bench Press: 225 lbs x 5 reps)
3. User saves the session
4. Backend checks all goals' targets
5. If activity instance meets a target:
   - Goal is automatically marked as complete
   - UI updates to show goal completion (checkmark in tree)
6. User sees visual feedback (notification or highlight)

## Implementation Steps

### Phase 1: Backend Foundation
1. ✅ Add `targets` column to Goal model
2. ✅ Create database migration
3. ✅ Update Goal `to_dict()` method
4. ✅ Update goal update endpoint to accept targets

### Phase 2: Target Matching Logic
5. ✅ Implement target comparison function
6. ✅ Add target checking to session save/update
7. ✅ Auto-mark goals complete when targets met

### Phase 3: Frontend UI
8. ✅ Create TargetCard component
9. ✅ Create AddTargetModal component
10. ✅ Add Targets section to goal inspector
11. ✅ Implement add/edit/delete target handlers
12. ✅ Display target completion status

### Phase 4: Testing & Polish
13. ✅ Test target creation and editing
14. ✅ Test automatic goal completion
15. ✅ Test target display in sidebar
16. ✅ Add visual feedback for completion

## Questions to Resolve

1. **Target Matching**: Should targets require exact match or "greater than or equal"?
   - Recommendation: Greater than or equal (allows progress beyond target)

2. **Multiple Targets**: Can a goal have multiple targets?
   - Recommendation: Yes, ANY target completion marks goal complete

3. **Target Deletion**: What happens if a target is deleted after goal is marked complete?
   - Recommendation: Goal remains complete (completion is permanent)

4. **Sets Handling**: For activities with sets, how do we match?
   - Option A: Match any single set
   - Option B: Match total across all sets
   - Recommendation: Option A (any single set meets target)

5. **Target Editing**: Can targets be edited after creation?
   - Recommendation: Yes, with confirmation dialog

## Time Estimate
- Backend: 2-3 hours
- Frontend: 3-4 hours
- Testing: 1-2 hours
- **Total**: 6-9 hours

## Notes
- This feature creates a powerful goal-tracking mechanism
- Targets provide clear, measurable completion criteria
- Automatic completion reduces manual tracking overhead
- UI should make it easy to see progress toward targets
