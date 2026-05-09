import React from 'react';

import { ActivityPickerModal } from '../activityPicker';

function ActivityFilterModal({
    title = 'Filter by Activity',
    activities = [],
    activityGroups = [],
    initialActivityIds = [],
    initialGroupIds = [],
    onConfirm,
    onClose,
    selectionMode = 'multiple',
    allowGroupSelection = selectionMode === 'multiple',
    activityCounts = {},
    groupCounts = {},
    confirmLabel = 'Apply filters',
}) {
    return (
        <ActivityPickerModal
            title={title}
            activities={activities}
            activityGroups={activityGroups}
            selectedActivityIds={initialActivityIds}
            selectedGroupIds={initialGroupIds}
            selectionMode={selectionMode}
            allowActivitySelection
            allowGroupSelection={allowGroupSelection}
            counts={{
                activitiesById: activityCounts,
                groupsById: groupCounts,
            }}
            confirmLabel={confirmLabel}
            searchPlaceholder="Search activities..."
            onConfirm={({ activityIds, groupIds }) => {
                onConfirm?.(activityIds, groupIds);
                onClose?.();
            }}
            onCancel={onClose}
            onClose={onClose}
        />
    );
}

export default ActivityFilterModal;
