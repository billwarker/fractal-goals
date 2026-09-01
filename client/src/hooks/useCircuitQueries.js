import { useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
        onSuccess: invalidate,
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
    return { ...mutation, saveMemberMetrics };
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
