# Practice Session Feature Implementation Plan

## Overview
This document outlines the implementation of the practice session creation feature that allows:
1. Creating practice sessions from a dedicated button in the sidebar
2. Associating a practice session with multiple short-term goals (many-to-one relationship)
3. Adding immediate goals directly when creating a practice session
4. Auto-generating practice session names with index and date

## Current Status
✅ Frontend state management added
✅ Helper functions created (collectShortTermGoals, countPracticeSessions)
✅ Practice session modal JSX designed (see practice-session-modal.jsx)
❌ Backend needs modification to support multiple parents
❌ Modal needs to be integrated into App.jsx
❌ CSS styling needs to be added

## Backend Changes Required

### 1. Modify Goal Model (goals.py)
The current model uses a single `parent` field. For practice sessions to have multiple short-term goal parents, we need:

**Option A: Add a `parents` list field to PracticeSession**
```python
class PracticeSession(Goal):
    def __init__(self, ...):
        super().__init__(...)
        self.parents = []  # List of parent goals
        # Keep self.parent for backward compatibility or remove it
```

**Option B: Use a separate relationship tracking**
- Keep the current single-parent model
- Add a separate `related_goals` field for practice sessions
- This maintains the tree structure while allowing cross-references

### 2. Add New API Endpoint (server.py)
Create a new endpoint specifically for practice session creation:

```python
@app.post("/api/goals/practice-session")
async def create_practice_session(request: Request):
    data = await request.json()
    
    # Extract data
    name = data.get("name")
    description = data.get("description", "")
    parent_ids = data.get("parent_ids", [])  # List of short-term goal IDs
    immediate_goals = data.get("immediate_goals", [])  # List of immediate goal objects
    
    # Validation
    if not parent_ids or len(parent_ids) == 0:
        raise HTTPException(status_code=400, detail="At least one parent short-term goal required")
    
    # Find all parent goals
    parent_goals = []
    for parent_id in parent_ids:
        parent_goal = find_goal_by_id(parent_id, all_roots)
        if not parent_goal:
            raise HTTPException(status_code=404, detail=f"Parent goal {parent_id} not found")
        if not isinstance(parent_goal, ShortTermGoal):
            raise HTTPException(status_code=400, detail="Parents must be ShortTermGoals")
        parent_goals.append(parent_goal)
    
    # Create practice session
    # Attach to first parent for tree structure
    practice_session = PracticeSession(
        name=name,
        description=description,
        parent=parent_goals[0]
    )
    
    # Store references to other parents (if using Option A)
    if len(parent_goals) > 1:
        practice_session.parents = parent_goals
    
    # Create immediate goals
    for ig_data in immediate_goals:
        if ig_data.get("name"):
            ImmediateGoal(
                name=ig_data["name"],
                description=ig_data.get("description", ""),
                parent=practice_session
            )
    
    save_goals()
    return {"success": True, "practice_session": practice_session.to_dict()}
```

### 3. Update Serialization
Modify `to_dict()` and `from_dict()` to handle multiple parents if using Option A.

## Frontend Integration

### 1. Add Modal to App.jsx
Insert the practice session modal JSX (from practice-session-modal.jsx) after the Goal Details Modal, around line 630.

### 2. Update Button Handler
The button handler has been partially updated. Ensure it opens the modal correctly.

### 3. Add CSS Styling
Add to App.css:

```css
/* Practice Session Modal */
.practice-session-modal {
    width: 600px;
    max-width: 90vw;
}

.session-name-preview {
    background: rgba(76, 175, 80, 0.1);
    padding: 15px;
    border-radius: 6px;
    margin-bottom: 20px;
    border: 1px solid rgba(76, 175, 80, 0.3);
}

.session-name-preview p {
    margin: 5px 0 0 0;
    color: #4caf50;
    font-weight: 600;
}

.form-section {
    margin-bottom: 25px;
}

.form-section label {
    display: block;
    margin-bottom: 10px;
    color: #fff;
}

.checkbox-list {
    max-height: 200px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.2);
    padding: 12px;
    border-radius: 6px;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
}

.checkbox-label:hover {
    background: rgba(255, 255, 255, 0.05);
}

.checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--accent-color);
}

.no-goals-message {
    color: #666;
    font-style: italic;
    padding: 10px;
}

.immediate-goal-item {
    background: rgba(0, 0, 0, 0.2);
    padding: 15px;
    border-radius: 6px;
    margin-bottom: 12px;
    border: 1px solid var(--border-color);
}

.immediate-goal-input,
.immediate-goal-textarea {
    width: 100%;
    padding: 10px;
    margin-bottom: 10px;
    background: #1e1e1e;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: white;
    font-family: inherit;
}

.immediate-goal-input:focus,
.immediate-goal-textarea:focus {
    outline: none;
    border-color: var(--accent-color);
}

.remove-goal-btn {
    background: #d32f2f;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s;
}

.remove-goal-btn:hover {
    background: #b71c1c;
}

.add-goal-btn {
    background: transparent;
    color: var(--accent-color);
    border: 1px dashed var(--accent-color);
    padding: 10px 15px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
    width: 100%;
}

.add-goal-btn:hover {
    background: rgba(55, 148, 255, 0.1);
}
```

## Visualization Considerations

### Multiple Parents in Tree View
Since react-d3-tree expects a strict tree structure (one parent per node), we have options:

1. **Primary Parent Approach**: Display the practice session under its first/primary parent in the tree, but show a badge or indicator that it's linked to multiple goals

2. **Duplicate Nodes**: Show the same practice session under each parent (with visual indication they're the same)

3. **Special Connector Lines**: Use custom SVG to draw additional connection lines to other parents

**Recommended**: Option 1 (Primary Parent) with a visual indicator showing "Linked to 3 goals" or similar.

## Next Steps

1. Decide on backend architecture (Option A or B for multiple parents)
2. Implement backend changes
3. Integrate modal JSX into App.jsx
4. Add CSS styling
5. Test the complete flow
6. Consider visualization approach for multiple parents

## API Contract

### POST /api/goals/practice-session
**Request:**
```json
{
  "name": "Practice Session 1 - 12/21/2025",
  "description": "Practice session with 2 immediate goal(s)",
  "type": "PracticeSession",
  "parent_ids": ["uuid-1", "uuid-2"],
  "immediate_goals": [
    {
      "name": "Complete feature X",
      "description": "Implement the new feature"
    },
    {
      "name": "Review code",
      "description": ""
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "practice_session": {
    "name": "Practice Session 1 - 12/21/2025",
    "id": "new-uuid",
    "attributes": { ... },
    "children": [ ... immediate goals ... ]
  }
}
```
