import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isOnline } from '../offline/connectivity';
import { useOutbox } from '../offline/OutboxContext';
import { SESSION_OP, applyOptimistic } from '../offline/sessionOpHandlers';
import { activeWorkConflictError, findRunningInstance, nowIso } from '../offline/sessionOps';
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
    const offline = useOfflineCircuitActions(rootId, sessionId, mutation.mutateAsync);
    if (!offline) return { ...mutation, saveMemberMetrics };
    return { ...mutation, mutateAsync: offline.mutateAsync, saveMemberMetrics: offline.saveMemberMetrics };
}

const QUEUED_RUN_ACTIONS = new Set(['startRun', 'completeRun', 'resetRun', 'deleteRun']);

/** Device-first circuit timing and member results; structural edits wait for the queue and a connection. */
function useOfflineCircuitActions(rootId, sessionId, directMutateAsync) {
    const queryClient = useQueryClient();
    const outbox = useOutbox();

    return useMemo(() => {
        if (!outbox || !rootId || !sessionId) return null;
        const enqueue = (kind, request, meta, options) => {
            const op = { scope: sessionId, kind, ...request, ...options, meta: { rootId, sessionId, ...meta } };
            applyOptimistic(queryClient, op);
            return outbox.submit(op);
        };

        const assertCanStart = (runId) => {
            const session = queryClient.getQueryData(queryKeys.session(rootId, sessionId));
            if (session?.is_paused) throw new Error('Resume the session before starting a circuit');
            const runs = queryClient.getQueryData(queryKeys.sessionCircuitRuns(rootId, sessionId)) || [];
            if (runs.some((run) => run.id !== runId && ['active', 'paused'].includes(run.status))) {
                throw new Error('Another circuit is already active in this session');
            }
            const running = findRunningInstance(queryClient.getQueryData(queryKeys.sessionActivities(rootId, sessionId)));
            if (running) throw activeWorkConflictError(running);
        };

        const mutateAsync = async (variables) => {
            const { action, runId } = variables;
            if (!QUEUED_RUN_ACTIONS.has(action)) {
                if (!isOnline()) throw new Error('This change needs a connection');
                await outbox.whenDrained(sessionId);
                return directMutateAsync(variables);
            }
            if (action === 'startRun') assertCanStart(runId);
            const occurredAt = nowIso();
            const base = `/${rootId}/circuit-runs/${runId}`;
            const request = {
                startRun: { method: 'post', url: `${base}/start`, body: { occurred_at: occurredAt } },
                completeRun: { method: 'post', url: `${base}/complete`, body: { occurred_at: occurredAt } },
                resetRun: { method: 'patch', url: `${base}/timing`, body: { time_start: null, time_stop: null } },
                deleteRun: { method: 'delete', url: base },
            }[action];
            await enqueue(SESSION_OP.CIRCUIT_RUN, request, { runId, action, occurredAt }, { entityIds: [runId] });
            return { data: null };
        };

        const saveMemberMetrics = async ({ runId, memberId, metrics }) => {
            await enqueue(
                SESSION_OP.CIRCUIT_MEMBER,
                {
                    method: 'patch',
                    url: `/${rootId}/circuit-runs/${runId}/members/${memberId}/metrics`,
                    body: { metrics },
                },
                { runId, memberId, metrics },
                { entityIds: [runId, memberId], coalesceKey: `circuit-member:${memberId}` },
            );
            return { data: null };
        };

        return { mutateAsync, saveMemberMetrics };
    }, [directMutateAsync, outbox, queryClient, rootId, sessionId]);
}


export function useCreateCircuitRun(rootId, sessionId) {
    const queryClient = useQueryClient();
    return useMutation({
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
}
