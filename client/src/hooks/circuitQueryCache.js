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

export function refreshCircuitSessionConsumers(queryClient, rootId, sessionId) {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.session(rootId, sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionActivities(rootId, sessionId) }),
    ]);
}
