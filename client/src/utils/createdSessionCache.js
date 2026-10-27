import { queryKeys } from '../hooks/queryKeys';
import { invalidateAfterSessionCreated, invalidateOnboardingProgress } from './queryInvalidation';

export function updateCreatedSessionCaches(queryClient, rootId, createdSession) {
    const createdSessionId = createdSession.id;

    queryClient.setQueryData(queryKeys.sessionsPaginated(rootId), (prev) => {
        if (!prev || !Array.isArray(prev.pages) || prev.pages.length === 0) return prev;
        const [firstPage, ...restPages] = prev.pages;
        const existing = (firstPage.sessions || []).some((session) => session.id === createdSession.id);
        if (existing) return prev;

        const updatedFirstPage = {
            ...firstPage,
            sessions: [createdSession, ...(firstPage.sessions || [])],
            pagination: firstPage.pagination
                ? {
                    ...firstPage.pagination,
                    total: typeof firstPage.pagination.total === 'number'
                        ? firstPage.pagination.total + 1
                        : firstPage.pagination.total
                }
                : firstPage.pagination
        };

        return {
            ...prev,
            pages: [updatedFirstPage, ...restPages]
        };
    });

    queryClient.setQueryData(queryKeys.sessions(rootId), (prev) => {
        if (!Array.isArray(prev)) return prev;
        if (prev.some((session) => session.id === createdSession.id)) return prev;
        return [createdSession, ...prev];
    });

    queryClient.setQueryData(queryKeys.sessionsAll(rootId), (prev) => {
        if (!Array.isArray(prev)) return prev;
        if (prev.some((session) => session.id === createdSession.id)) return prev;
        return [createdSession, ...prev];
    });

    queryClient.setQueryData(queryKeys.session(rootId, createdSessionId), createdSession);

    invalidateAfterSessionCreated(queryClient, rootId, queryKeys);
    // Advances the onboarding "Create your first session" step.
    invalidateOnboardingProgress(queryClient, queryKeys);
}
