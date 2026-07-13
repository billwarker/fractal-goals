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
    ], options);
}

export function invalidateOnboardingProgress(queryClient, queryKeys) {
    return queryClient.invalidateQueries({ queryKey: queryKeys.onboardingRoot() });
}
