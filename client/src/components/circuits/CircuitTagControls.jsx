import ActivityTagEditor from '../sessionDetail/ActivityTagEditor';
import CircuitScopeTagEditor from './CircuitScopeTagEditor';


export function collectCircuitAvailableTags(activityDefinitions, slots) {
    const activityIds = new Set((slots || []).map((slot) => slot.activity_definition_id));
    return (activityDefinitions || [])
        .filter((definition) => activityIds.has(definition.id))
        .flatMap((definition) => definition.tags || []);
}

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
    const scopeNames = new Set(
        [...(runTags || []), ...(roundTags || [])].map((tag) => tag.name.toLocaleLowerCase()),
    );
    const scopeTags = (definition.tags || []).filter(
        (tag) => scopeNames.has(tag.name.toLocaleLowerCase()),
    );
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
            availableTags={definition.tags || []}
            tags={activitySet ? activitySet.tags || [] : instance.tags || []}
            inheritedTags={inheritedTags}
            editable={editable}
        />
    );
}
