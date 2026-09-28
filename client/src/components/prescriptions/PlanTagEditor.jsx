import React from 'react';

import ActivityTagEditor from '../sessionDetail/ActivityTagEditor';

/**
 * Planned tags for an activity or one of its sets: the session page's tag picker in
 * controlled mode, so picks land in the plan draft. Hidden when there is nothing to show.
 */
export default function PlanTagEditor({
    rootId,
    definition,
    tagIds = [],
    onChangeTags,
    editable,
    setScope = false,
    inheritedTags = [],
    className = '',
}) {
    if (!rootId || !definition?.id || (!editable && tagIds.length === 0)) return null;
    return (
        <ActivityTagEditor
            className={className}
            rootId={rootId}
            activityId={definition.id}
            availableTags={definition.tags || []}
            inheritedTags={inheritedTags}
            selectedTagIds={tagIds}
            onChangeTags={onChangeTags}
            setScope={setScope}
            editable={editable}
            triggerFirst
        />
    );
}
