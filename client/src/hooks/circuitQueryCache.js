import { queryKeys } from './queryKeys';


export function updateCircuitRunCache(queryClient, rootId, sessionId, action, response) {
    const payload = response?.data;
    if (!payload) return;
    queryClient.setQueryData(
        queryKeys.sessionCircuitRuns(rootId, sessionId),
        (current = []) => {
            if (action === 'deleteRun') {
                return current.filter((run) => run.id !== payload.id);
            }
            const existingIndex = current.findIndex((run) => run.id === payload.id);
            if (existingIndex < 0) return [...current, payload];
            return current.map((run, index) => (index === existingIndex ? payload : run));
        },
    );
}

const SUMMARY_ACTIONS = new Set([
    'createRun',
    'deleteRun',
    'startRun',
    'completeRun',
    'updateRunTiming',
    'resetRun',
    'addRound',
    'removeRound',
]);

export function refreshCircuitSessionConsumers(queryClient, rootId, sessionId, action) {
    const invalidations = [
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionCircuitRuns(rootId, sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.session(rootId, sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionActivities(rootId, sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionProgressSummary(sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.progressRoot() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalAnalytics(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionsEvidenceGoalsRoot(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionsFlowtreeMetricsRoot(rootId) }),
    ];
    if (SUMMARY_ACTIONS.has(action)) {
        invalidations.push(
            queryClient.invalidateQueries({ queryKey: ['circuits', rootId] }),
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionTemplates(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.sessions(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionsPaginated(rootId) }),
            queryClient.invalidateQueries({ queryKey: ['analytics-summary', rootId] }),
            queryClient.invalidateQueries({ queryKey: ['analytics-sessions', rootId] }),
        );
    }
    return Promise.all(invalidations);
}
