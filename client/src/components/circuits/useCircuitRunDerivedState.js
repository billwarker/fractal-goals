import { useMemo } from 'react';

import { useActivityTagCatalog } from '../../hooks/useActivityProgressViews';
import { getCircuitRoundEntries } from '../../utils/prescriptionModel';
import { getCircuitNotes, getCircuitNoteTarget } from './circuitNoteTarget';


export default function useCircuitRunDerivedState({
    rootId,
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
    const { data: catalog } = useActivityTagCatalog(rootId);
    const circuitAvailableTags = useMemo(
        () => (catalog?.tags || []).map((tag) => ({ ...tag, definition_id: tag.id })),
        [catalog?.tags],
    );
    const noteTarget = useMemo(
        () => getCircuitNoteTarget(run, selectedCircuitItem, sessionId),
        [run, selectedCircuitItem, sessionId],
    );
    const circuitNotes = useMemo(() => getCircuitNotes(run, allNotes), [allNotes, run]);

    // The run's plan (snapshotted at session creation): a round's note and a member's values.
    const plan = run.prescription || null;
    const roundPlanNote = (round) => plan?.rounds?.[round.round_number - 1]?.notes || null;
    const plannedMemberValues = (round, slot) => getCircuitRoundEntries(plan, round.round_number - 1, slot?.source_slot_id);

    return {
        slotById,
        instanceById,
        definitionById,
        circuitAvailableTags,
        noteTarget,
        circuitNotes,
        roundPlanNote,
        plannedMemberValues,
    };
}
