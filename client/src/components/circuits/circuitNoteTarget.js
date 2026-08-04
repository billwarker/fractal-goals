const findRound = (run, roundId) => (
    (run.rounds || []).find((round) => round.id === roundId) || null
);

const findMemberContext = (run, memberId) => {
    for (const round of run.rounds || []) {
        const member = (round.members || []).find((candidate) => candidate.id === memberId);
        if (!member) continue;
        const slot = (run.slots || []).find((candidate) => candidate.id === member.circuit_run_slot_id);
        return { round, member, slot };
    }
    return null;
};

const noteInstanceId = (note) => note.activity_instance_id
    || (note.context_type === 'activity_instance' ? note.context_id : null);

export function getCircuitNotes(run, notes = []) {
    const roundAnnotations = new Map();
    const setAnnotations = new Map();
    const activityAnnotations = new Map();
    const slots = new Map((run.slots || []).map((slot) => [slot.id, slot]));

    for (const round of run.rounds || []) {
        roundAnnotations.set(round.id, [`Round ${round.round_number}`, 'Circuit Round']);

        for (const member of round.members || []) {
            const slot = slots.get(member.circuit_run_slot_id);
            const instanceId = member.activity_instance_id || slot?.activity_instance_id;
            const position = `${round.round_number}.${member.sort_order + 1}`;
            const activityName = slot?.activity_name || 'Activity';
            if (member.activity_set_id) {
                setAnnotations.set(
                    member.activity_set_id,
                    [`${position} ${activityName} · Set ${round.round_number}`, 'Activity Set'],
                );
            } else if (instanceId) {
                activityAnnotations.set(instanceId, [`${position} ${activityName}`, 'Round Activity']);
            }
        }
    }

    return notes.flatMap((note) => {
        let annotation = null;
        if (note.context_type === 'circuit_run' && note.context_id === run.id) {
            annotation = [run.name || 'Activity circuit', 'Activity Circuit'];
        } else if (note.context_type === 'circuit_round') {
            annotation = roundAnnotations.get(note.context_id);
        } else if (note.context_type === 'activity_instance') {
            annotation = note.activity_set_id
                ? setAnnotations.get(note.activity_set_id)
                : activityAnnotations.get(noteInstanceId(note));
        }
        if (!annotation) return [];
        return [{
            ...note,
            circuit_annotation: annotation[0],
            context_display_name: annotation[0],
            note_type_label: annotation[1],
        }];
    });
}

export function getCircuitNoteTarget(run, selectedCircuitItem, sessionId) {
    const selected = selectedCircuitItem?.runId === run.id ? selectedCircuitItem : null;

    if (selected?.type === 'member') {
        const context = findMemberContext(run, selected.id);
        if (context) {
            const { round, member, slot } = context;
            const instanceId = member.activity_instance_id || slot?.activity_instance_id;
            const setId = member.activity_set_id || null;
            if (instanceId) {
                return {
                    kind: setId ? 'set' : 'activity',
                    label: slot?.activity_name || 'Activity',
                    placeholder: setId
                        ? `Note for ${slot?.activity_name || 'activity'} · Set #${round.round_number}...`
                        : `Note for ${slot?.activity_name || 'this activity'}...`,
                    payload: {
                        context_type: 'activity_instance',
                        context_id: instanceId,
                        session_id: sessionId || run.session_id,
                        activity_instance_id: instanceId,
                        activity_definition_id: slot?.activity_definition_id || null,
                        activity_set_id: setId,
                    },
                };
            }
        }
    }

    if (selected?.type === 'round') {
        const round = findRound(run, selected.id);
        if (round) {
            return {
                kind: 'round',
                label: `Round ${round.round_number}`,
                placeholder: `Add a note about Round ${round.round_number}...`,
                payload: {
                    context_type: 'circuit_round',
                    context_id: round.id,
                    session_id: sessionId || run.session_id,
                },
            };
        }
    }

    return {
        kind: 'circuit',
        label: run.name || 'Activity circuit',
        placeholder: 'Add a note about this activity circuit...',
        payload: {
            context_type: 'circuit_run',
            context_id: run.id,
            session_id: sessionId || run.session_id,
        },
    };
}
