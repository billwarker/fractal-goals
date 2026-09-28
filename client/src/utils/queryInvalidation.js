export function invalidateQueryKeys(queryClient, queryKeys, options = {}) {
    queryKeys
        .filter(Boolean)
        .forEach((queryKey) => {
            queryClient.invalidateQueries({ queryKey, ...options });
        });
}

export function invalidateSessionLists(queryClient, rootId, queryKeys, options = {}) {
    invalidateQueryKeys(queryClient, [
        queryKeys.activeSessionRoot(),
        queryKeys.sessions(rootId),
        queryKeys.sessionsAll(rootId),
        queryKeys.sessionsPaginated(rootId),
        queryKeys.programMetricsRoot(rootId),
        // Days-tab occurrence statuses and executed plans follow session changes.
        queryKeys.programSessionPlansRoot(rootId),
    ], options);
}

/** Read models a newly created session changes, including which dated plans are executed. */
export function invalidateAfterSessionCreated(queryClient, rootId, queryKeys) {
    invalidateQueryKeys(queryClient, [
        queryKeys.sessions(rootId),
        queryKeys.sessionsAll(rootId),
        queryKeys.sessionsPaginated(rootId),
        queryKeys.sessionsSearch(rootId),
        queryKeys.sessionsHeatmap(rootId),
        queryKeys.sessionTemplates(rootId),
    ], { refetchType: 'inactive' });
    invalidateQueryKeys(queryClient, [
        queryKeys.programMetricsRoot(rootId),
        queryKeys.programDayReadModelRoot(rootId),
        queryKeys.programDayOptions(rootId),
        queryKeys.programSessionPlansRoot(rootId),
        queryKeys.activeSessionRoot(),
    ]);
}

export function invalidateOnboardingProgress(queryClient, queryKeys) {
    return queryClient.invalidateQueries({
        queryKey: queryKeys.onboardingRoot(),
        predicate: (query) => !['dismissed', 'completed'].includes(query.state.data?.status),
    });
}
