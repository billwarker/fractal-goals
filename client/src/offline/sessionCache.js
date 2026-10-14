/** The session whose cached activities contain this instance (or set), so its write can be queued there. */
export function findSessionForActivity(queryClient, rootId, { instanceId = null, setId = null }) {
    for (const [queryKey, instances] of queryClient.getQueriesData({ queryKey: ['session-activities', rootId] })) {
        if (!Array.isArray(instances)) continue;
        const match = instances.find((instance) => (
            (instanceId && instance.id === instanceId)
            || (setId && (instance.sets || []).some((set) => set.id === setId))
        ));
        if (match) return { sessionId: queryKey[2], instanceId: match.id };
    }
    return null;
}
