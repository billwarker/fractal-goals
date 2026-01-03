# Programs Page Improvements - January 2, 2026

## Summary

Implemented improvements to the programs page to enhance user control and simplify the interface when working with training blocks and program days.

## Changes Made

### 1. User-Controlled Day Creation

**Problem:** Days were automatically populated for every date in a block's range, giving users no control over which days to configure.

**Solution:** Removed automatic day population from `sync_program_structure` in `programs_api.py`.

**Impact:**
- Users now have full control over which days to add to each block
- Blocks start empty and users explicitly add days using the "+ Add Day" button
- Cleaner, more intentional program structure

**Files Modified:**
- `/blueprints/programs_api.py` (lines 56-60)

### 2. Edit Block Functionality

**Problem:** No way to edit a block's details (name, dates, color) after creation.

**Solution:** Added "Edit Block" button and functionality to modify existing blocks.

**Features Added:**
- "Edit Block" button next to "Attach Goal" and "+ Add Day" in blocks view
- `handleEditBlockClick` function to populate modal with existing block data
- Updated `handleSaveBlock` to handle both create and update operations
- `ProgramBlockModal` now preserves block `id` for updates

**Impact:**
- Users can now modify block properties without recreating them
- Better workflow for iterative program design

**Files Modified:**
- `/client/src/pages/ProgramDetail.jsx` (lines 128-139, 140-186, 507-513)
- `/client/src/components/modals/ProgramBlockModal.jsx` (renamed from TrainingBlockModal.jsx, line 16)

### 3. Simplified Day Modal

**Problem:** The "Edit Program Day" modal had both a cascade checkbox and a "Copy to Other Blocks" button, which was redundant and confusing. Also used "training" language instead of "program".

**Solution:** 
- Removed the cascade checkbox, keeping only the explicit "Copy to Other Blocks" button
- Removed the "All Blocks" radio button indicator
- Renamed TrainingBlockModal to ProgramBlockModal

**Impact:**
- Clearer, less confusing UI
- Copy functionality available through single, clear button when editing
- Simplified save operation (no cascade parameter on initial save)
- Consistent "program" terminology throughout

**Files Modified:**
- `/client/src/components/modals/ProgramDayModal.jsx` (removed lines 9, 48, 53, 64, 172-182)
- `/client/src/components/modals/ProgramBlockModal.jsx` (renamed from TrainingBlockModal.jsx)

### 4. Delete Block Functionality

**Problem:** No way to remove blocks from a program once created.

**Solution:** Added "Delete Block" button with confirmation dialog.

**Features Added:**
- "Delete Block" button positioned before "+ Add Day" button
- Confirmation dialog warns that all days within the block will be deleted
- Uses standard delete button styling (red background: #d32f2f)
- `handleDeleteBlock` function filters block from weekly schedule and updates program

**Impact:**
- Users can remove unwanted blocks without manual data manipulation
- Confirmation prevents accidental deletions
- Cleaner program management workflow

**Files Modified:**
- `/client/src/pages/ProgramDetail.jsx` (lines 188-214, 541-547)

## Technical Details

### Backend Changes

**programs_api.py - sync_program_structure:**
```python
# Before: Auto-populated days for entire date range
# After: Only a comment noting user-controlled day creation
processed_block_ids.add(block.id)

# NOTE: Days are no longer auto-populated from the block's date range.
# Users must explicitly add days using the "+ Add Day" button.
# This gives users full control over which days to configure in each block.
```

### Frontend Changes

**ProgramDetail.jsx - Block Editing:**
```jsx
// New handler for editing blocks
const handleEditBlockClick = (block) => {
    setBlockModalData({
        id: block.id,
        name: block.name,
        startDate: block.start_date,
        endDate: block.end_date,
        color: block.color || '#3A86FF'
    });
    setShowBlockModal(true);
};

// Updated save handler to support both create and update
const handleSaveBlock = async (blockData) => {
    if (blockData.id) {
        // Update existing block
        updatedSchedule = currentSchedule.map(block => 
            block.id === blockData.id ? { ...block, ...updates } : block
        );
    } else {
        // Create new block
        updatedSchedule = [...currentSchedule, newBlock];
    }
    // ... save to API
};
```

**ProgramDetail.jsx - Block Deletion:**
```jsx
// New handler for deleting blocks with confirmation
const handleDeleteBlock = async (blockId) => {
    if (!window.confirm('Are you sure you want to delete this block? All days within this block will also be deleted.')) {
        return;
    }

    const currentSchedule = Array.isArray(program.weekly_schedule) ? program.weekly_schedule : [];
    const updatedSchedule = currentSchedule.filter(block => block.id !== blockId);

    try {
        const apiData = {
            name: program.name,
            description: program.description || '',
            start_date: program.start_date,
            end_date: program.end_date,
            selectedGoals: program.goal_ids || [],
            weeklySchedule: updatedSchedule
        };

        await fractalApi.updateProgram(rootId, program.id, apiData);
        fetchProgramData();
    } catch (err) {
        console.error('Failed to delete block:', err);
        alert('Failed to delete block');
    }
};
```

**ProgramDayModal.jsx - Simplified:**
```jsx
// Removed cascade state and checkbox
// handleSave now only sends: name, template_ids, day_of_week
// Copy functionality remains available in edit mode via explicit button
```

## User Experience Improvements

1. **More Intentional Program Design:** Users build their program structure deliberately rather than having to delete unwanted auto-generated days.

2. **Flexible Block Management:** Blocks can be created, edited, and deleted as program design evolves.

3. **Clearer Day Operations:** Single, clear "Copy to Other Blocks" action instead of confusing cascade checkbox.

4. **Safe Deletions:** Confirmation dialogs prevent accidental data loss.

## Testing Recommendations

1. Create a new program and verify blocks start with no days
2. Add days to blocks and verify they appear correctly
3. Edit a block's name, dates, and color and verify changes persist
4. Delete a block and confirm it's removed along with its days
5. Edit a program day and use "Copy to Other Blocks" to verify it works
6. Verify existing programs with auto-populated days still function correctly

## Documentation Updates

Updated `/index.md`:
- Enhanced `ProgramDetail.jsx` features section with detailed capabilities
- Added program-related modal components to the modal components list
