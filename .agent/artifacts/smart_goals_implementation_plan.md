# SMART Goals Implementation Plan

## Overview

SMART goals are goals that meet these criteria:
- **S**pecific - Has a description
- **M**easurable - Has at least one target attached
- **A**chievable - Has activities associated with it (new feature)
- **R**elevant - User provided a "relevance statement" explaining how it helps achieve parent goal
- **T**ime-bound - Has a deadline

## Database Changes

### 1. Goal Model Updates (`models.py`)

Add new fields to the `Goal` class:
```python
# SMART goal fields
relevance_statement = Column(Text, nullable=True)  # "How does this goal help achieve [parent]?"
is_smart = Column(Boolean, default=False)  # Computed flag, updated on save
```

### 2. New Junction Table: `activity_goal_associations`

Create a many-to-many relationship between activities and goals:
```python
activity_goal_associations = Table(
    'activity_goal_associations', Base.metadata,
    Column('activity_id', String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now)
)
```

### 3. Migration Script

Create `python-scripts/migrate_smart_goals.py`:
- Add `relevance_statement` column to goals table
- Add `is_smart` column to goals table
- Create `activity_goal_associations` table

## Backend API Changes

### 1. Goals API Updates (`blueprints/goals_api.py`)

- Update `update_fractal_goal` to accept `relevance_statement`
- Add SMART calculation logic when saving goals
- Return SMART criteria status in goal responses

### 2. Activities API Updates (`blueprints/activities_api.py`)

Add new endpoints:
- `POST /api/<root_id>/activities/<activity_id>/goals` - Associate activity with goal(s)
- `DELETE /api/<root_id>/activities/<activity_id>/goals/<goal_id>` - Remove association
- `GET /api/<root_id>/activities/<activity_id>/goals` - Get associated goals
- `GET /api/<root_id>/goals/<goal_id>/activities` - Get associated activities

## Frontend Changes

### 1. GoalDetailModal.jsx

#### Header Section (next to goal level badge):
- Add "SMART" text with individual letter highlighting
- Each letter colored with goal's cosmic color if criterion is met
- Gray if criterion not met
- Tooltip on each letter showing criterion status

#### New Field (under description):
- Add "Relevance" field with prompt: "How does this goal help you achieve [parent goal name]?"
- Show only if goal has a parent
- Textarea input

#### SMART Status Display:
- Small legend showing which criteria are met

### 2. FlowTree.jsx / CustomNode

Add visual indicator for SMART goals:
- Extra ring/glow around node if `is_smart === true`
- Use goal's cosmic color for the ring

### 3. ManageActivities.jsx / ActivityBuilder.jsx

Add goal association feature:
- In ActivityBuilder or new modal, show list of goals
- Allow selecting multiple goals to associate with activity
- Display associated goals on ActivityCard

### 4. API Updates (`utils/api.js`)

Add new API functions:
- `associateActivityWithGoals(rootId, activityId, goalIds)`
- `removeActivityGoalAssociation(rootId, activityId, goalId)`
- `getActivityGoals(rootId, activityId)`
- `getGoalActivities(rootId, goalId)`

### 5. Utility Functions

Create `utils/smartHelpers.js`:
- `calculateSMARTStatus(goal)` - Returns object with each criterion status
- `isSMART(goal)` - Returns boolean

## Implementation Order

### Phase 1: Database & Backend Foundation
1. ✅ Create migration script
2. ✅ Update Goal model with new fields
3. ✅ Add activity-goal junction table
4. ✅ Update goals API to handle new fields
5. ✅ Add activity-goal association endpoints

### Phase 2: Frontend Core
6. ✅ Add SMART utility functions
7. ✅ Update GoalDetailModal with SMART indicator
8. ✅ Add relevance statement field to GoalDetailModal
9. ✅ Update API utils

### Phase 3: Visual Indicators
10. ✅ Add SMART ring to FlowTree nodes
11. ✅ Style the SMART letter indicator

### Phase 4: Activity Associations
12. ✅ Add goal selection to ActivityBuilder modal
13. ⏳ Display associated goals on ActivityCard (optional enhancement)

## SMART Calculation Logic

```javascript
function calculateSMARTStatus(goal, associatedActivities = []) {
    return {
        specific: !!(goal.description && goal.description.trim().length > 0),
        measurable: !!(goal.targets && goal.targets.length > 0),
        achievable: associatedActivities.length > 0,
        relevant: !!(goal.relevance_statement && goal.relevance_statement.trim().length > 0),
        timeBound: !!goal.deadline,
    };
}

function isSMART(goal, associatedActivities = []) {
    const status = calculateSMARTStatus(goal, associatedActivities);
    return status.specific && status.measurable && status.achievable && 
           status.relevant && status.timeBound;
}
```

## UI Mockup

### GoalDetailModal Header:
```
┌─────────────────────────────────────────┐
│ [Short Term Goal]  S M A R T            │
│                    ↑ ↑ ↑ ↑ ↑            │
│                    │ │ │ │ └─ Teal (has deadline)
│                    │ │ │ └─── Gray (no relevance)
│                    │ │ └───── Teal (has activities)
│                    │ └─────── Teal (has targets)
│                    └───────── Teal (has description)
└─────────────────────────────────────────┘
```

### FlowTree Node (SMART):
```
     ╭─────────╮
    ╱ ╭───────╮ ╲   ← Extra outer ring in cosmic color
   │  │ Goal  │  │
   │  │ Name  │  │
    ╲ ╰───────╯ ╱
     ╰─────────╯
```
