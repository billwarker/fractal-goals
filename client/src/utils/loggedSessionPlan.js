// What a logged session recorded, in a plan's shape. The Days tab's completed-session card shows
// these values and Copy copies them, so a copied plan is exactly what the card showed.

/** A session section's recorded work items, from hydrated typed items or legacy exercises. */
export function sessionSectionItems(section) {
    if (Array.isArray(section?.items) && section.items.some((item) => item?.activity || item?.circuit)) {
        return section.items
            .map((item) => {
                if (item?.type === 'circuit' && item.circuit) return { type: 'circuit', circuit: item.circuit };
                if (item?.type === 'activity' && item.activity) return { type: 'activity', activity: item.activity };
                return null;
            })
            .filter(Boolean);
    }
    return (section?.exercises || []).map((activity) => ({ type: 'activity', activity }));
}

export function activityIdOf(activity) {
    return activity.activity_id || activity.activity_definition_id;
}

/** An activity instance's logged values as a prescription value (sets, flat metrics, notes). */
export function loggedActivityValue(activity) {
    return {
        sets: (activity.sets || []).map((loggedSet) => ({ metrics: loggedSet.metrics, notes: loggedSet.notes })),
        metrics: activity.metrics || [],
        notes: activity.notes || null,
    };
}

/** A circuit run's slots in order, each with the definition it records. */
export function loggedCircuitSlots(run, activityById = new Map()) {
    return [...(run.slots || [])]
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((slot) => ({
            id: slot.id,
            source_slot_id: slot.source_slot_id || null,
            activity_definition_id: slot.activity_definition_id,
            definition: activityById.get(slot.activity_definition_id)
                || { ...(slot.activity_schema || {}), name: slot.activity_name },
        }));
}

/** A circuit run's logged rounds in the plan's round shape, keyed by run slot id. */
export function loggedCircuitRounds(run, slots) {
    return [...(run.rounds || [])]
        .sort((left, right) => left.round_number - right.round_number)
        .map((round) => ({
            slots: slots.map((slot) => ({
                slot_id: slot.id,
                metrics: round.members?.find((member) => member.circuit_run_slot_id === slot.id)?.metrics || [],
            })),
            notes: null,
        }));
}

/**
 * A logged session's sections as plan sections: each activity's logged sets and each circuit's
 * logged rounds become the item's prescription. Circuit rounds refer to the circuit
 * definition's slots (`source_slot_id`), as plans do.
 */
export function loggedSessionPlanSections(session) {
    return (session?.attributes?.session_data?.sections || []).map((section) => ({
        name: section.name,
        items: sessionSectionItems(section).map((item) => {
            if (item.type === 'circuit') {
                const run = item.circuit;
                const slots = loggedCircuitSlots(run);
                const sourceIds = new Map(slots.map((slot) => [slot.id, slot.source_slot_id]));
                const rounds = loggedCircuitRounds(run, slots).map((round) => ({
                    ...round,
                    slots: round.slots
                        .filter((slot) => sourceIds.get(slot.slot_id))
                        .map((slot) => ({ ...slot, slot_id: sourceIds.get(slot.slot_id) })),
                }));
                return {
                    type: 'circuit',
                    circuit_definition_id: run.circuit_definition_id,
                    name: run.name,
                    prescription: { rounds },
                };
            }
            const { activity } = item;
            return {
                type: 'activity',
                activity_definition_id: activityIdOf(activity),
                name: activity.name,
                prescription: loggedActivityValue(activity),
            };
        }),
    }));
}
