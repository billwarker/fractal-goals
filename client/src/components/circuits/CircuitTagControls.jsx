import ActivityTagEditor from '../sessionDetail/ActivityTagEditor';
import CircuitScopeTagEditor from './CircuitScopeTagEditor';


export function CircuitRunTagControl({ className = '', run, availableTags, disabled, editable = true, onPerform }) {
    return (
        <CircuitScopeTagEditor
            className={className}
            scopeLabel="Circuit tags"
            tags={run.tags || []}
            availableTags={availableTags}
            disabled={disabled}
            editable={editable}
            triggerFirst
            onChange={(value) => onPerform({ action: 'updateRunTag', value, inlineError: true })}
        />
    );
}

export function CircuitRoundTagControl({ round, availableTags, disabled, editable = true, onPerform }) {
    return (
        <CircuitScopeTagEditor
            scopeLabel={`Round ${round.round_number} tags`}
            tags={round.tags || []}
            availableTags={availableTags}
            disabled={disabled}
            editable={editable}
            onChange={(value) => onPerform({
                action: 'updateRoundTag',
                roundId: round.id,
                value,
                inlineError: true,
            })}
        />
    );
}

export function CircuitMemberTagEditor({
    rootId,
    definition,
    instance,
    activitySet,
    runTags,
    roundTags,
    editable = true,
}) {
    if (!instance || !definition) return null;
    // Run and round scopes own their catalog tags; the member shows them as inherited.
    const scopeTags = [...(runTags || []), ...(roundTags || [])].map((tag) => ({
        id: tag.definition_id, name: tag.name, color: tag.color,
    }));
    const inheritedTags = [
        ...(activitySet ? instance.tags || [] : []),
        ...scopeTags,
    ].filter((tag, index, rows) => (
        rows.findIndex((candidate) => candidate.id === tag.id) === index
    ));
    return (
        <ActivityTagEditor
            rootId={rootId}
            activityId={definition.id}
            instanceId={activitySet ? null : instance.id}
            setId={activitySet?.id || null}
            assignmentVersion={activitySet
                ? activitySet.tag_assignment_version
                : instance.tag_assignment_version}
            tags={activitySet ? activitySet.tags || [] : instance.tags || []}
            inheritedTags={inheritedTags}
            editable={editable}
        />
    );
}
