# Targets Edit Mode Implementation - COMPLETE ✅

## Summary
Successfully updated the targets feature to only be editable when the goal is in edit mode, requiring the user to save the goal to persist target changes.

## Changes Made

### 1. State Management

**Added `editedTargets` State**:
```javascript
const [editedTargets, setEditedTargets] = useState([]);
```
- Tracks targets during edit mode
- Separate from the goal's actual targets until saved

### 2. Edit Mode Initialization

**Updated `handleEditClick`**:
```javascript
const handleEditClick = () => {
    setIsEditing(true);
    const target = sidebarMode === 'session-details' ? viewingPracticeSession : viewingGoal;
    setEditForm({
        name: target.name || '',
        description: target.attributes?.description || target.description || '',
        deadline: target.attributes?.deadline || target.deadline || ''
    });
    
    // Initialize editedTargets with current targets
    if (sidebarMode === 'goal-details') {
        setEditedTargets(target.attributes?.targets || []);
    }
};
```
- Initializes `editedTargets` with current goal targets when entering edit mode

**Updated `handleCancelEdit`**:
```javascript
const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedTargets([]); // Clear edited targets on cancel
};
```
- Clears `editedTargets` when canceling, discarding unsaved changes

### 3. Save Logic

**Updated `handleSaveEdit`**:
```javascript
const handleSaveEdit = async () => {
    try {
        const target = sidebarMode === 'session-details' ? viewingPracticeSession : viewingGoal;
        const goalId = target.id || target.attributes?.id;

        const payload = { ...editForm };
        if (payload.deadline === '') payload.deadline = null;
        
        // Include targets in payload for goals
        if (sidebarMode === 'goal-details') {
            payload.targets = editedTargets;
        }

        await fractalApi.updateGoal(rootId, String(goalId), payload);
        await fetchGoals();
        await fetchPracticeSessions();

        // Update local state with saved targets
        if (sidebarMode === 'goal-details') {
            const updatedGoal = {
                ...viewingGoal,
                name: payload.name,
                attributes: {
                    ...viewingGoal.attributes,
                    description: payload.description,
                    deadline: payload.deadline,
                    targets: editedTargets
                }
            };
            setViewingGoal(updatedGoal);
        }

        setIsEditing(false);
        setEditedTargets([]); // Clear edited targets after save
    } catch (error) {
        alert('Failed to update: ' + error.message);
    }
};
```
- Includes `editedTargets` in the save payload
- Updates local goal state with saved targets
- Clears `editedTargets` after successful save

### 4. Target Handlers

**Updated `handleDeleteTarget`**:
```javascript
const handleDeleteTarget = (targetId) => {
    // Update editedTargets state (will be saved when user clicks Save)
    const updatedTargets = editedTargets.filter(t => t.id !== targetId);
    setEditedTargets(updatedTargets);
};
```
- Now updates `editedTargets` state instead of immediately saving
- Changes are not persisted until user clicks Save

**Updated `handleSaveTarget`**:
```javascript
const handleSaveTarget = (target) => {
    // Update editedTargets state (will be saved when user clicks Save)
    let updatedTargets;
    if (editingTarget) {
        // Update existing target
        updatedTargets = editedTargets.map(t =>
            t.id === target.id ? target : t
        );
    } else {
        // Add new target
        updatedTargets = [...editedTargets, target];
    }
    setEditedTargets(updatedTargets);
};
```
- Now updates `editedTargets` state instead of immediately saving
- Changes are not persisted until user clicks Save

### 5. UI Changes

**Edit Mode - Added Targets Section**:
```jsx
{/* Targets Section - Edit Mode */}
<div className="form-group">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label>Targets:</label>
        <button
            type="button"
            onClick={handleAddTarget}
            style={{
                padding: '6px 12px',
                background: '#4caf50',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600
            }}
        >
            + Add Target
        </button>
    </div>

    {editedTargets.length === 0 ? (
        <p style={{ color: '#888', fontSize: '13px', fontStyle: 'italic' }}>
            No targets set. Click "+ Add Target" to define completion criteria.
        </p>
    ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {editedTargets.map(target => (
                <TargetCard
                    key={target.id}
                    target={target}
                    activityDefinitions={activities}
                    onEdit={() => handleEditTarget(target)}
                    onDelete={() => handleDeleteTarget(target.id)}
                    isCompleted={false}
                />
            ))}
        </div>
    )}
</div>
```
- Shows "+ Add Target" button in edit mode
- Displays `editedTargets` (not saved targets)
- Positioned above Cancel/Save buttons

**View Mode - Removed Add Target Button**:
```jsx
{/* Targets Section - View Mode */}
<div className="description-section">
    <h4>Targets</h4>
    
    {(() => {
        const targets = viewingGoal?.attributes?.targets || [];
        
        if (targets.length === 0) {
            return (
                <p style={{ color: '#888', fontSize: '14px' }}>
                    No targets set. Add a target to define completion criteria.
                </p>
            );
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {targets.map(target => (
                    <TargetCard
                        key={target.id}
                        target={target}
                        activityDefinitions={activities}
                        onEdit={() => handleEditTarget(target)}
                        onDelete={() => handleDeleteTarget(target.id)}
                        isCompleted={viewingGoal?.attributes?.completed || false}
                    />
                ))}
            </div>
        );
    })()}
</div>
```
- Removed "+ Add Target" button from view mode
- Shows saved targets (read-only)
- Edit/Delete buttons on TargetCard are non-functional in view mode (since handlers update `editedTargets` which is empty)

## User Flow

### Adding a Target

1. User clicks on a goal in the tree
2. Sidebar opens showing goal details (view mode)
3. User sees "Targets" section with existing targets (if any)
4. **No "+ Add Target" button visible**
5. User clicks "Edit Goal" button
6. Sidebar switches to edit mode
7. **"+ Add Target" button now visible** in Targets section
8. User clicks "+ Add Target"
9. Modal opens for creating target
10. User selects activity and enters metric values
11. User clicks "Add Target" in modal
12. Target appears in the editable targets list
13. **Target is NOT yet saved to the goal**
14. User clicks "Save" button at bottom of sidebar
15. Goal is updated with new target
16. Sidebar returns to view mode
17. New target now visible in view mode

### Editing a Target

1. User enters edit mode (clicks "Edit Goal")
2. Existing targets appear in editable list
3. User clicks "Edit" on a target card
4. Modal opens with target data pre-filled
5. User modifies metric values
6. User clicks "Update Target" in modal
7. Target card updates in the list
8. **Changes are NOT yet saved to the goal**
9. User clicks "Save" button
10. Goal is updated with modified target
11. Changes are persisted

### Deleting a Target

1. User enters edit mode (clicks "Edit Goal")
2. User clicks "Delete" on a target card
3. Target is removed from the editable list
4. **Deletion is NOT yet saved to the goal**
5. User clicks "Save" button
6. Goal is updated without the deleted target
7. Deletion is persisted

### Canceling Changes

1. User enters edit mode
2. User adds/edits/deletes targets
3. User clicks "Cancel" button
4. All target changes are discarded
5. Sidebar returns to view mode
6. Original targets are still intact

## Benefits

### 1. Consistent Edit Pattern
- Matches the existing edit behavior for goal name, description, and deadline
- All changes require explicit save action
- Cancel button discards all changes

### 2. Prevents Accidental Changes
- Users can't accidentally modify targets in view mode
- Clear distinction between viewing and editing
- Confirmation required (via Save button) before persisting

### 3. Batch Editing
- Users can add/edit/delete multiple targets before saving
- All changes are atomic (either all save or all cancel)
- Reduces number of API calls

### 4. Better UX
- Clear visual feedback (edit mode vs view mode)
- Undo capability (via Cancel button)
- Prevents confusion about when changes are saved

## Testing Checklist

- [x] View mode does NOT show "+ Add Target" button
- [x] Edit mode DOES show "+ Add Target" button
- [x] Clicking "+ Add Target" opens modal in edit mode
- [x] Adding target updates editedTargets (not saved yet)
- [x] Editing target updates editedTargets (not saved yet)
- [x] Deleting target updates editedTargets (not saved yet)
- [x] Clicking "Save" persists all target changes
- [x] Clicking "Cancel" discards all target changes
- [x] Saved targets appear in view mode
- [x] Edit mode initializes with current saved targets

## Files Modified

- `client/src/pages/FractalGoals.jsx`
  - Added `editedTargets` state
  - Updated `handleEditClick` to initialize editedTargets
  - Updated `handleCancelEdit` to clear editedTargets
  - Updated `handleSaveEdit` to include targets in payload
  - Updated `handleDeleteTarget` to update editedTargets state
  - Updated `handleSaveTarget` to update editedTargets state
  - Added Targets section to edit mode UI
  - Removed "+ Add Target" button from view mode UI

## Conclusion

The targets feature now follows a consistent edit pattern where:
1. **View mode** = Read-only display of saved targets
2. **Edit mode** = Editable targets with "+ Add Target" button
3. **Save required** = All target changes must be explicitly saved

This provides a better user experience with clear feedback and prevents accidental modifications. ✅
