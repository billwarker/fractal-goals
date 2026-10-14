// Pure builders and patches for circuits changed offline. Shapes mirror
// serialize_circuit_run so the existing circuit views render placeholders as-is;
// the server's copy replaces each one when its write is acknowledged.

import { buildPlaceholderInstance } from './sessionOps';
import {
    initialRoundId,
    roundMemberId,
    roundMemberInstanceId,
    roundMemberSetId,
    runSlotId,
    runSlotInstanceId,
} from './circuitIds';

function activitySchema(activity) {
    return {
        id: activity?.id || null,
        name: activity?.name || 'Activity',
        has_sets: Boolean(activity?.has_sets),
        has_metrics: Boolean(activity?.has_metrics),
        has_splits: Boolean(activity?.has_splits),
        metric_definitions: activity?.metric_definitions || [],
        split_definitions: activity?.split_definitions || [],
    };
}

/** A new round with derived member ids. ``runSlots`` are the run's (already id'd) slots. */
export async function buildPlaceholderRound(runSlots, { roundId, roundNumber, tags = [] }) {
    const slots = [...runSlots].sort((left, right) => left.sort_order - right.sort_order);
    const members = await Promise.all(slots.map(async (slot) => ({
        id: await roundMemberId(roundId, slot.id),
        circuit_run_slot_id: slot.id,
        activity_instance_id: slot.has_sets ? slot.activity_instance_id : await roundMemberInstanceId(roundId, slot.id),
        activity_set_id: slot.has_sets ? await roundMemberSetId(roundId, slot.id) : null,
        sort_order: slot.sort_order,
        metrics: [],
    })));
    return { id: roundId, round_number: roundNumber, tags, members };
}

/** The run the server will create from ``definition`` with client run id ``runId``. */
export async function buildPlaceholderRun(definition, { runId, sessionId, rootId, now = new Date().toISOString() }) {
    const sourceSlots = [...(definition.slots || [])].sort((left, right) => left.sort_order - right.sort_order);
    const slots = await Promise.all(sourceSlots.map(async (source) => {
        const activity = source.activity || {};
        const hasSets = Boolean(activity.has_sets);
        return {
            id: await runSlotId(runId, source.id),
            source_slot_id: source.id,
            activity_definition_id: source.activity_definition_id,
            activity_instance_id: hasSets ? await runSlotInstanceId(runId, source.id) : null,
            sort_order: source.sort_order,
            activity_name: activity.name || 'Activity',
            has_sets: hasSets,
            has_metrics: Boolean(activity.has_metrics),
            activity_schema: activitySchema(activity),
        };
    }));
    const firstRound = await buildPlaceholderRound(slots, {
        roundId: await initialRoundId(runId, 1),
        roundNumber: 1,
    });
    return {
        id: runId,
        root_id: rootId,
        session_id: sessionId,
        circuit_definition_id: definition.id,
        source_version: definition.version ?? null,
        name: definition.name,
        description: definition.description || '',
        round_count: 1,
        prescription: null,
        status: 'planned',
        time_start: null,
        time_stop: null,
        duration_seconds: null,
        is_paused: false,
        last_paused_at: null,
        total_paused_seconds: 0,
        completed_at: null,
        created_at: now,
        updated_at: now,
        tags: [],
        slots,
        rounds: [firstRound],
        _pendingSync: true,
    };
}

/**
 * The activity instances the server creates alongside a circuit: one per set-based
 * slot, plus one per non-set member in ``rounds``. Circuit views resolve members
 * through these, so they must exist before sync too.
 */
export function placeholderCircuitInstances(run, { sessionId, rootId, rounds = run.rounds || [] }) {
    const slotsById = new Map((run.slots || []).map((slot) => [slot.id, slot]));
    const instanceFor = (id, slot) => buildPlaceholderInstance({
        id,
        sessionId,
        rootId,
        definition: {
            id: slot.activity_definition_id,
            name: slot.activity_name,
            has_sets: slot.has_sets,
            has_metrics: slot.has_metrics,
        },
    });
    const slotInstances = rounds === run.rounds
        ? (run.slots || []).filter((slot) => slot.has_sets && slot.activity_instance_id)
            .map((slot) => instanceFor(slot.activity_instance_id, slot))
        : [];
    const memberInstances = rounds.flatMap((round) => (round.members || [])
        .filter((member) => !member.activity_set_id && member.activity_instance_id)
        .map((member) => instanceFor(member.activity_instance_id, slotsById.get(member.circuit_run_slot_id) || {})));
    return [...slotInstances, ...memberInstances];
}

const withRounds = (run, rounds) => ({ ...run, rounds, round_count: rounds.length });

export function addRoundToRun(run, round) {
    if ((run.rounds || []).some((existing) => existing.id === round.id)) return run;
    return withRounds(run, [...(run.rounds || []), round]);
}

/** Removing a round renumbers the rest, as the server does. */
export function removeRoundFromRun(run, roundId) {
    const rounds = (run.rounds || [])
        .filter((round) => round.id !== roundId)
        .sort((left, right) => left.round_number - right.round_number)
        .map((round, index) => ({ ...round, round_number: index + 1 }));
    return withRounds(run, rounds);
}

const metricKey = (metric) => `${metric.metric_definition_id || metric.metric_id}|${metric.split_id ?? metric.split_definition_id ?? ''}`;

/** Fill one member's value into the same slot's *empty* entry in every later round, like the server. */
export function cascadeMemberMetric(run, { memberId, metricId, splitId = null }) {
    const rounds = [...(run.rounds || [])].sort((left, right) => left.round_number - right.round_number);
    const sourceRound = rounds.find((round) => (round.members || []).some((member) => member.id === memberId));
    const sourceMember = sourceRound?.members.find((member) => member.id === memberId);
    if (!sourceMember) return run;
    const key = `${metricId}|${splitId ?? ''}`;
    const value = (sourceMember.metrics || []).find((metric) => metricKey(metric) === key);
    if (!value) return run;
    return {
        ...run,
        rounds: rounds.map((round) => (round.round_number <= sourceRound.round_number ? round : {
            ...round,
            members: (round.members || []).map((member) => {
                if (member.circuit_run_slot_id !== sourceMember.circuit_run_slot_id) return member;
                if ((member.metrics || []).some((metric) => metricKey(metric) === key)) return member;
                return { ...member, metrics: [...(member.metrics || []), { ...value, id: undefined }] };
            }),
        })),
    };
}

const normalizedName = (name) => String(name || '').trim().split(/\s+/).join(' ').toLowerCase();

/** Optimistic chip add/remove for a run- or round-scope tag (the server's mutation payload). */
export function applyTagChange(run, { roundId = null, data }) {
    const matches = (existing) => (data.definition_id
        ? existing.definition_id === data.definition_id
        : normalizedName(existing.name) === normalizedName(data.name));
    const change = (tags = []) => {
        if (data.assigned === false) return tags.filter((existing) => !matches(existing));
        if (tags.some(matches)) return tags;
        return [...tags, {
            id: `pending-${data.definition_id || normalizedName(data.name)}`,
            definition_id: data.definition_id || null,
            name: data.name,
            color: data.color || null,
            sort_order: tags.length,
        }];
    };
    if (!roundId) return { ...run, tags: change(run.tags) };
    return {
        ...run,
        rounds: (run.rounds || []).map((round) => (round.id === roundId ? { ...round, tags: change(round.tags) } : round)),
    };
}
