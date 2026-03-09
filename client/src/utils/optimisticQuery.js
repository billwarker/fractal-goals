export function captureQueryRollback(queryClient, queryKey) {
    const previousData = queryClient.getQueryData(queryKey);

    return () => {
        queryClient.setQueryData(queryKey, previousData);
    };
}

export function applyOptimisticQueryUpdate({ queryClient, queryKey, updater }) {
    const rollback = captureQueryRollback(queryClient, queryKey);
    queryClient.setQueryData(queryKey, updater);
    return rollback;
}
