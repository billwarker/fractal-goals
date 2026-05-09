import React from 'react';

import { ActivityPicker } from '../activityPicker';

export default function ActivitySelectorPanel({
    activities = [],
    activityGroups = [],
    onClose,
    onSelectActivity,
    onCreateActivityDefinition,
    onCopyActivityDefinition,
    allowCreate = false,
    allowCopy = false,
    closeOnSelect = false,
}) {
    return (
        <ActivityPicker
            activities={activities}
            activityGroups={activityGroups}
            title="Select Activity Group"
            selectionMode="single"
            allowActivitySelection
            allowCreateActivity={allowCreate}
            allowCopyActivity={allowCopy}
            closeOnSelect={closeOnSelect}
            showFooter={false}
            variant="panel"
            onClose={onClose}
            onCancel={onClose}
            onCreateActivity={onCreateActivityDefinition}
            onCopyActivity={onCopyActivityDefinition}
            onChange={({ activities: selectedActivities }) => {
                const activity = selectedActivities[0];
                if (activity) onSelectActivity?.(activity);
            }}
        />
    );
}
