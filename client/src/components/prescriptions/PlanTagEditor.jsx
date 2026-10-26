import React from 'react';

import { useActivityTagCatalog } from '../../hooks/useActivityTags';
import ActivityTagEditor from '../sessionDetail/ActivityTagEditor';

/**
 * Planned tags for an activity, a set, a circuit, a round, or one member of a round: the
 * session page's tag picker in controlled mode, so picks land in the plan draft. Hidden when
 * there is nothing to show. `scopeId` keys a picker that isn't an activity's (a circuit);
 * `inheritedTagIds` are the enclosing scopes' planned tags, shown as inherited.
 */
export default function PlanTagEditor({
    rootId,
    definition,
    scopeId = null,
    tagIds = [],
    editable,
    ...props
}) {
    const id = scopeId || definition?.id;
    if (!rootId || !id || (!editable && tagIds.length === 0)) return null;
    return <PlanTagPicker rootId={rootId} scopeId={id} tagIds={tagIds} editable={editable} {...props} />;
}

function PlanTagPicker({
    rootId,
    scopeId,
    tagIds,
    onChangeTags,
    editable,
    setScope = false,
    scopeLabel = null,
    inheritedTags = [],
    inheritedTagIds = null,
    className = '',
}) {
    const { data: catalog } = useActivityTagCatalog(rootId);
    const inherited = inheritedTagIds?.length
        ? [
            ...inheritedTags,
            ...inheritedTagIds
                .map((tagId) => catalog.tags.find((tag) => tag.id === tagId))
                .filter((tag) => tag && !inheritedTags.some((known) => known.id === tag.id)),
        ]
        : inheritedTags;
    return (
        <ActivityTagEditor
            className={className}
            rootId={rootId}
            activityId={scopeId}
            inheritedTags={inherited}
            selectedTagIds={tagIds}
            onChangeTags={onChangeTags}
            setScope={setScope}
            scopeLabel={scopeLabel}
            editable={editable}
            triggerFirst
        />
    );
}
