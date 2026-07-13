import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidateSessionLists as invalidateSharedSessionLists } from '../utils/queryInvalidation';
import { fractalApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

export function useSessionOptionsMutations(rootId, sessionId) {
    const queryClient = useQueryClient();

    const invalidateSessionLists = async () => {
        await invalidateSharedSessionLists(queryClient, rootId, queryKeys);
    };

    const createTemplateMutation = useMutation({
        mutationFn: async (name) => {
            const response = await fractalApi.createTemplateFromSession(rootId, sessionId, { name });
            return response.data;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessionTemplates(rootId) });
            notify.success('Template created');
        },
        onError: (error) => {
            notify.error(`Failed to save template: ${formatError(error)}`);
        },
    });

    const duplicateSessionMutation = useMutation({
        mutationFn: async () => {
            const response = await fractalApi.duplicateSession(rootId, sessionId);
            return response.data;
        },
        onSuccess: async () => {
            await invalidateSessionLists();
            notify.success('Session duplicated');
        },
        onError: (error) => {
            notify.error(`Failed to duplicate session: ${formatError(error)}`);
        },
    });

    return {
        isSavingTemplate: createTemplateMutation.isPending,
        isDuplicatingSession: duplicateSessionMutation.isPending,
        createTemplateFromSession: (name) => createTemplateMutation.mutateAsync(name),
        duplicateSession: () => duplicateSessionMutation.mutateAsync(),
    };
}

export default useSessionOptionsMutations;
