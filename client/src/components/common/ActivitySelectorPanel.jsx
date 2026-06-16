import React from 'react';

import { ActivityPicker } from '../activityPicker';

export default function ActivitySelectorPanel({
    activities = [],
    activityGroups = [],
    onClose,
    onSelectActivity,
    onSelectGroup,
    onCreateActivityDefinition,
    onCopyActivityDefinition,
    allowCreate = false,
    allowCopy = false,
    allowGroupSelection = false,
    closeOnSelect = false,
    initialBrowseGroupId = null,
    groupSelectionLabel = 'Use Group',
    groupSelectedLabel = 'Selected',
}) {
    return (
        <ActivityPicker
            activities={activities}
            activityGroups={activityGroups}
            title="Select Activity Group"
            selectionMode="single"
            allowActivitySelection
            allowGroupSelection={allowGroupSelection}
            allowCreateActivity={allowCreate}
            allowCopyActivity={allowCopy}
            closeOnSelect={closeOnSelect}
            initialBrowseGroupId={initialBrowseGroupId}
            groupSelectionLabel={groupSelectionLabel}
            groupSelectedLabel={groupSelectedLabel}
            showFooter={false}
            variant="panel"
            onClose={onClose}
            onCancel={onClose}
            onCreateActivity={onCreateActivityDefinition}
            onCopyActivity={onCopyActivityDefinition}
            onChange={({ activities: selectedActivities, groups: selectedGroups }) => {
                const group = selectedGroups[0];
                if (group && onSelectGroup) {
                    onSelectGroup(group);
                    onClose?.();
                    return;
                }
                const activity = selectedActivities[0];
                if (activity) onSelectActivity?.(activity);
            }}
        />
    );
}
