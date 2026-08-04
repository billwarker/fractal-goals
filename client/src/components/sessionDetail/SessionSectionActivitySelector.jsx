import React from 'react';

import useScopedSessionActivityOptions from '../../hooks/useScopedSessionActivityOptions';
import ActivitySelectorPanel from '../common/ActivitySelectorPanel';

export default function SessionSectionActivitySelector({
    activities,
    circuitDefinitions,
    activityGroups,
    activityGoalScope,
    onClose,
    onSelectActivity,
    onSelectCircuit,
    onCreateActivityDefinition,
    onCopyActivityDefinition,
    initialBrowseGroupId,
}) {
    const { scopedActivities, scopedCircuitDefinitions } = useScopedSessionActivityOptions(
        activities, circuitDefinitions, activityGoalScope
    );

    return (
        <ActivitySelectorPanel
            activities={scopedActivities}
            circuits={scopedCircuitDefinitions}
            activityGroups={activityGroups}
            activityGoalScope={activityGoalScope}
            onClose={onClose}
            onSelectActivity={onSelectActivity}
            onSelectCircuit={onSelectCircuit}
            onCreateActivityDefinition={onCreateActivityDefinition}
            onCopyActivityDefinition={onCopyActivityDefinition}
            allowCreate
            allowCopy
            showTypeToggle
            initialBrowseGroupId={initialBrowseGroupId}
        />
    );
}
