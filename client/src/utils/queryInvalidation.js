export function invalidateQueryKeys(queryClient, queryKeys, options = {}) {
    queryKeys
        .filter(Boolean)
        .forEach((queryKey) => {
            queryClient.invalidateQueries({ queryKey, ...options });
        });
}

export function invalidateSessionLists(queryClient, rootId, queryKeys, options = {}) {
    invalidateQueryKeys(queryClient, [
        queryKeys.sessions(rootId),
        queryKeys.sessionsAll(rootId),
        queryKeys.sessionsPaginated(rootId),
    ], options);
}
