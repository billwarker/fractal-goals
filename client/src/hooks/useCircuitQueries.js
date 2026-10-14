import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isOnline } from '../offline/connectivity';
import { useOutbox } from '../offline/OutboxContext';
import { SESSION_OP } from '../offline/opKinds';

// Circuit placeholder builders load with the first offline circuit action, not with every route.
const loadCircuitOps = () => import('../offline/circuitOps');
const loadSessionOps = () => import('../offline/sessionOps');
const nowIso = () => new Date().toISOString();
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';
import { refreshCircuitSessionConsumers, updateCircuitRunCache } from './circuitQueryCache';


export function useCircuits(rootId, { includeArchived = false } = {}) {
    return useQuery({
        queryKey: queryKeys.circuits(rootId, includeArchived),
        queryFn: async () => (await fractalApi.getCircuits(rootId, { include_archived: includeArchived })).data || [],
        enabled: Boolean(rootId),
    });
}


export function useCircuitDefinitionMutations(rootId) {
    const queryClient = useQueryClient();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['circuits', rootId] });
    const createMutation = useMutation({
        mutationFn: (data) => fractalApi.createCircuit(rootId, data),
        // The new definition is usable at once (e.g. added to a plan) before the list refetches.
        onSuccess: (response) => {
            const created = response?.data;
            if (created?.id) {
                queryClient.setQueryData(queryKeys.circuits(rootId), (previous) => {
                    if (!Array.isArray(previous) || previous.some((circuit) => circuit.id === created.id)) return previous;
                    return [...previous, created];
                });
            }
            return invalidate();
        },
    });
    const updateMutation = useMutation({
        mutationFn: ({ circuitId, data }) => fractalApi.updateCircuit(rootId, circuitId, data),
        onSuccess: invalidate,
    });
    const archiveMutation = useMutation({
        mutationFn: (circuitId) => fractalApi.archiveCircuit(rootId, circuitId),
        onSuccess: invalidate,
    });
    return { createMutation, updateMutation, archiveMutation };
}

/** Creates a circuit definition and resolves to the saved definition (with its id). */
export function useCreateCircuitDefinition(rootId) {
    const { mutateAsync } = useCircuitDefinitionMutations(rootId).createMutation;
    return useCallback(async (payload) => (await mutateAsync(payload))?.data, [mutateAsync]);
}


export function useCircuitRunActions(rootId, sessionId) {
    const queryClient = useQueryClient();
    const memberMetricQueueRef = useRef(Promise.resolve());
    const saveMemberMetrics = useCallback(({ runId, memberId, metrics }) => {
        const request = memberMetricQueueRef.current
            .catch(() => undefined)
            .then(async () => {
                const response = await fractalApi.updateCircuitMemberMetrics(rootId, runId, memberId, metrics);
                updateCircuitRunCache(queryClient, rootId, sessionId, 'updateMemberMetrics', response);
                void refreshCircuitSessionConsumers(queryClient, rootId, sessionId, 'updateMemberMetrics');
                return response;
            });
        memberMetricQueueRef.current = request;
        return request;
    }, [queryClient, rootId, sessionId]);
    const mutation = useMutation({
        mutationFn: async ({ action, runId, roundId, memberId, value }) => {
            switch (action) {
                case 'startRun': return fractalApi.startCircuitRun(rootId, runId);
                case 'completeRun': return fractalApi.completeCircuitRun(rootId, runId);
                case 'updateRunTiming': return fractalApi.updateCircuitRunTiming(rootId, runId, value);
                case 'resetRun': return fractalApi.updateCircuitRunTiming(rootId, runId, {
                    time_start: null,
                    time_stop: null,
                });
                case 'addRound': return fractalApi.addCircuitRound(rootId, runId);
                case 'removeRound': return fractalApi.deleteCircuitRound(rootId, runId, roundId);
                case 'updateMemberMetrics': return fractalApi.updateCircuitMemberMetrics(rootId, runId, memberId, value);
                case 'cascadeMemberMetric': return fractalApi.cascadeCircuitMemberMetric(
                    rootId,
                    runId,
                    memberId,
                    value.metricId,
                    value.splitId,
                );
                case 'updateRunTag': return fractalApi.updateCircuitRunTag(rootId, runId, value);
                case 'updateRoundTag': return fractalApi.updateCircuitRoundTag(rootId, runId, roundId, value);
                case 'deleteRun': return fractalApi.deleteCircuitRun(rootId, runId);
                default: throw new Error(`Unknown circuit action: ${action}`);
            }
        },
        onSuccess: async (response, variables) => {
            updateCircuitRunCache(queryClient, rootId, sessionId, variables.action, response);
            await refreshCircuitSessionConsumers(queryClient, rootId, sessionId, variables.action);
        },
    });
    const offline = useOfflineCircuitActions(rootId, sessionId);
    if (!offline) return { ...mutation, saveMemberMetrics };
    return { ...mutation, mutateAsync: offline.mutateAsync, saveMemberMetrics: offline.saveMemberMetrics };
}

/** Every id a placeholder run or round introduces, so a rejected create cascades to its edits. */
function placeholderIds(run) {
    return [
        run.id,
        ...(run.slots || []).flatMap((slot) => [slot.id, slot.activity_instance_id].filter(Boolean)),
        ...(run.rounds || []).flatMap(roundIds),
    ];
}

function roundIds(round) {
    return [
        round.id,
        ...(round.members || []).flatMap((member) => [member.id, member.activity_set_id, member.activity_instance_id]
            .filter(Boolean)),
    ];
}

/** Device-first circuit writes: every circuit action is queued and shown immediately. */
function useOfflineCircuitActions(rootId, sessionId) {
    const queryClient = useQueryClient();
    const outbox = useOutbox();

    return useMemo(() => {
        if (!outbox || !rootId || !sessionId) return null;
        const runsKey = queryKeys.sessionCircuitRuns(rootId, sessionId);
        const findRun = (runId) => (queryClient.getQueryData(runsKey) || []).find?.((run) => run.id === runId) || null;
        const enqueue = (kind, request, meta, options) => {
            const op = { scope: sessionId, kind, ...request, ...options, meta: { rootId, sessionId, ...meta } };
            return outbox.submit(op);
        };

        const assertCanStart = async (runId) => {
            const { activeWorkConflictError, findRunningInstance } = await loadSessionOps();
            const session = queryClient.getQueryData(queryKeys.session(rootId, sessionId));
            if (session?.is_paused) throw new Error('Resume the session before starting a circuit');
            const runs = queryClient.getQueryData(runsKey) || [];
            if (runs.some((run) => run.id !== runId && ['active', 'paused'].includes(run.status))) {
                throw new Error('Another circuit is already active in this session');
            }
            const running = findRunningInstance(queryClient.getQueryData(queryKeys.sessionActivities(rootId, sessionId)));
            if (running) throw activeWorkConflictError(running);
        };

        const saveMemberMetrics = async ({ runId, memberId, metrics }) => {
            // Include the member's round so removing that round drops this queued edit.
            const roundId = (findRun(runId)?.rounds || [])
                .find((round) => (round.members || []).some((member) => member.id === memberId))?.id;
            await enqueue(
                SESSION_OP.CIRCUIT_MEMBER,
                { method: 'patch', url: `/${rootId}/circuit-runs/${runId}/members/${memberId}/metrics`, body: { metrics } },
                { runId, memberId, metrics },
                {
                    entityIds: [runId, memberId, ...(roundId ? [roundId] : [])],
                    coalesceKey: `circuit-member:${memberId}`,
                },
            );
            return { data: null };
        };

        const mutateAsync = async ({ action, runId, roundId, memberId, value }) => {
            const base = `/${rootId}/circuit-runs/${runId}`;
            switch (action) {
                case 'startRun':
                case 'completeRun':
                case 'resetRun':
                case 'deleteRun':
                case 'updateRunTiming': {
                    if (action === 'startRun') await assertCanStart(runId);
                    const occurredAt = nowIso();
                    const request = {
                        startRun: { method: 'post', url: `${base}/start`, body: { occurred_at: occurredAt } },
                        completeRun: { method: 'post', url: `${base}/complete`, body: { occurred_at: occurredAt } },
                        resetRun: { method: 'patch', url: `${base}/timing`, body: { time_start: null, time_stop: null } },
                        updateRunTiming: { method: 'patch', url: `${base}/timing`, body: value },
                        deleteRun: { method: 'delete', url: base },
                    }[action];
                    await enqueue(SESSION_OP.CIRCUIT_RUN, request, { runId, action, occurredAt, value }, {
                        entityIds: [runId],
                        ...(action === 'deleteRun' ? { supersedes: [runId] } : {}),
                    });
                    return { data: null };
                }
                case 'addRound': {
                    const run = findRun(runId);
                    if (!run) throw new Error('Circuit not found');
                    const { buildPlaceholderRound, placeholderCircuitInstances } = await loadCircuitOps();
                    const newRoundId = crypto.randomUUID();
                    const round = await buildPlaceholderRound(run.slots || [], {
                        roundId: newRoundId,
                        roundNumber: Math.max(0, ...(run.rounds || []).map((item) => item.round_number)) + 1,
                        tags: run.tags || [],
                    });
                    await enqueue(
                        SESSION_OP.CIRCUIT_ROUND_ADD,
                        { method: 'post', url: `${base}/rounds`, body: { round_id: newRoundId } },
                        { runId, round, instances: placeholderCircuitInstances(run, { sessionId, rootId, rounds: [round] }) },
                        { entityIds: [runId], creates: roundIds(round) },
                    );
                    return { data: null };
                }
                case 'removeRound':
                    await enqueue(
                        SESSION_OP.CIRCUIT_ROUND_REMOVE,
                        { method: 'delete', url: `${base}/rounds/${roundId}` },
                        { runId, roundId },
                        { entityIds: [runId, roundId], supersedes: [roundId] },
                    );
                    return { data: null };
                case 'updateMemberMetrics':
                    return saveMemberMetrics({ runId, memberId, metrics: value });
                case 'cascadeMemberMetric':
                    await enqueue(
                        SESSION_OP.CIRCUIT_CASCADE,
                        {
                            method: 'post',
                            url: `${base}/members/${memberId}/metrics/cascade`,
                            body: { metric_id: value.metricId, ...(value.splitId ? { split_id: value.splitId } : {}) },
                        },
                        { runId, memberId, metricId: value.metricId, splitId: value.splitId || null },
                        { entityIds: [runId, memberId] },
                    );
                    return { data: null };
                case 'updateRunTag':
                case 'updateRoundTag':
                    await enqueue(
                        SESSION_OP.CIRCUIT_TAG,
                        {
                            method: 'patch',
                            url: action === 'updateRoundTag' ? `${base}/rounds/${roundId}/tags` : `${base}/tags`,
                            body: value,
                        },
                        { runId, roundId: action === 'updateRoundTag' ? roundId : null, data: value },
                        { entityIds: [runId, ...(roundId ? [roundId] : [])] },
                    );
                    return { data: null };
                default:
                    throw new Error(`Unknown circuit action: ${action}`);
            }
        };

        return { mutateAsync, saveMemberMetrics };
    }, [outbox, queryClient, rootId, sessionId]);
}


/** A cached circuit definition (any archived filter), or null. */
function cachedCircuitDefinition(queryClient, rootId, definitionId) {
    for (const [, data] of queryClient.getQueriesData({ queryKey: queryKeys.circuitsRoot(rootId) })) {
        const list = Array.isArray(data) ? data : data?.items || data?.circuits || [];
        const match = list.find?.((definition) => definition.id === definitionId);
        if (match) return match;
    }
    return null;
}

export function useCreateCircuitRun(rootId, sessionId) {
    const queryClient = useQueryClient();
    const outbox = useOutbox();
    const direct = useMutation({
        mutationFn: ({ circuitDefinitionId, sectionIndex, itemIndex }) => fractalApi.createCircuitRun(
            rootId,
            sessionId,
            {
                circuit_definition_id: circuitDefinitionId,
                section_index: sectionIndex,
                ...(Number.isInteger(itemIndex) ? { item_index: itemIndex } : {}),
            },
        ),
        onSuccess: async (response) => {
            updateCircuitRunCache(queryClient, rootId, sessionId, 'createRun', response);
            await refreshCircuitSessionConsumers(queryClient, rootId, sessionId, 'createRun');
        },
    });

    // Device-first: the run, its slots, rounds, and members appear immediately with the
    // same ids the server will derive from the client-minted run id.
    const mutateAsync = useCallback(async (variables) => {
        const definition = outbox && cachedCircuitDefinition(queryClient, rootId, variables.circuitDefinitionId);
        if (!definition) {
            if (outbox && !isOnline()) throw new Error('This circuit needs a connection to add');
            if (outbox) await outbox.whenDrained(sessionId);
            return direct.mutateAsync(variables);
        }
        const { buildPlaceholderRun, placeholderCircuitInstances } = await loadCircuitOps();
        const runId = crypto.randomUUID();
        const placeholder = await buildPlaceholderRun(definition, { runId, sessionId, rootId });
        const op = {
            scope: sessionId,
            kind: SESSION_OP.CIRCUIT_CREATE,
            method: 'post',
            url: `/${rootId}/sessions/${sessionId}/circuit-runs`,
            body: {
                id: runId,
                circuit_definition_id: definition.id,
                section_index: variables.sectionIndex,
                ...(Number.isInteger(variables.itemIndex) ? { item_index: variables.itemIndex } : {}),
            },
            creates: placeholderIds(placeholder),
            meta: {
                rootId,
                sessionId,
                runId,
                placeholder,
                instances: placeholderCircuitInstances(placeholder, { sessionId, rootId }),
                sectionIndex: variables.sectionIndex ?? 0,
                itemIndex: Number.isInteger(variables.itemIndex) ? variables.itemIndex : null,
            },
        };
        await outbox.submit(op);
        return { data: placeholder };
    }, [direct, outbox, queryClient, rootId, sessionId]);

    return { ...direct, mutateAsync };
}
