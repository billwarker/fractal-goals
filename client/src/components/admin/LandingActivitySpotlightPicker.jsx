import React from 'react';

import { ActivityPicker } from '../activityPicker';

export default function LandingActivitySpotlightPicker({
    activities = [],
    activityGroups = [],
    selectedActivityId = null,
    onChange,
}) {
    return (
        <div>
            <ActivityPicker
                key={selectedActivityId || 'no-activity'}
                activities={activities}
                activityGroups={activityGroups}
                title="Spotlight activity"
                searchPlaceholder="Search activities..."
                selectionMode="single"
                selectedActivityIds={selectedActivityId ? [selectedActivityId] : []}
                allowActivitySelection
                allowGroupSelection={false}
                allowCreateActivity={false}
                allowCopyActivity={false}
                allowCreateGroup={false}
                showFooter={false}
                showCloseButton={false}
                showPrimaryActions={false}
                variant="panel"
                onChange={({ activityIds }) => onChange(activityIds[0] || null)}
            />
        </div>
    );
}
