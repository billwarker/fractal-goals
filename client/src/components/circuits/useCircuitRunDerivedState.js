import { useMemo } from 'react';

import { collectCircuitAvailableTags } from './CircuitTagControls';
import { getCircuitNotes, getCircuitNoteTarget } from './circuitNoteTarget';


export default function useCircuitRunDerivedState({
    run,
    activityInstances,
    activityDefinitions,
    selectedCircuitItem,
    sessionId,
    allNotes,
}) {
    const slotById = useMemo(
        () => new Map((run.slots || []).map((slot) => [slot.id, slot])),
        [run.slots],
    );
    const instanceById = useMemo(
        () => new Map((activityInstances || []).map((instance) => [instance.id, instance])),
        [activityInstances],
    );
    const definitionById = useMemo(
        () => new Map((activityDefinitions || []).map((definition) => [definition.id, definition])),
        [activityDefinitions],
    );
    const circuitAvailableTags = useMemo(
        () => collectCircuitAvailableTags(activityDefinitions, run.slots),
        [activityDefinitions, run.slots],
    );
    const noteTarget = useMemo(
        () => getCircuitNoteTarget(run, selectedCircuitItem, sessionId),
        [run, selectedCircuitItem, sessionId],
    );
    const circuitNotes = useMemo(() => getCircuitNotes(run, allNotes), [allNotes, run]);

    return { slotById, instanceById, definitionById, circuitAvailableTags, noteTarget, circuitNotes };
}
