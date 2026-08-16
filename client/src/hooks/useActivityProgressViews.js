import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

const invalidateProgress = (queryClient, rootId, activityId) => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.activityProgressViews(rootId, activityId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activityProgressTimeline(rootId, activityId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.progressRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessionActivitiesRoot(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) }),
]);

export function useActivityTags(rootId, activityId, { includeArchived = true } = {}) {
    return useQuery({
        queryKey: [...queryKeys.activityTags(rootId, activityId), { includeArchived }],
        enabled: Boolean(rootId && activityId),
        queryFn: async () => {
            const response = await fractalApi.getActivityTags(rootId, activityId, {
                include_archived: includeArchived,
            });
            return response.data;
        },
    });
}

export function useActivityProgressTimeline(rootId, activityId, {
    excludeSessionId = null,
    draftConfig = null,
    limit = 20,
} = {}) {
    const previewKey = draftConfig ? JSON.stringify(draftConfig) : null;
    return useQuery({
        queryKey: [...queryKeys.activityProgressTimeline(rootId, activityId, excludeSessionId), limit, previewKey],
        enabled: Boolean(rootId && activityId),
        queryFn: async () => {
            if (draftConfig) {
                const response = await fractalApi.queryActivityProgress(rootId, activityId, {
                    config: draftConfig,
                    exclude_session_id: excludeSessionId,
                    limit,
                    offset: 0,
                });
                return response.data;
            }
            const response = await fractalApi.getActivityProgressTimeline(rootId, activityId, {
                exclude_session_id: excludeSessionId,
                limit,
            });
            return response.data;
        },
    });
}

export function useActivityProgressViewMutations(rootId, activityId) {
    const queryClient = useQueryClient();
    const useConfiguredMutation = (mutationFn) => useMutation({
        mutationFn,
        onSuccess: () => invalidateProgress(queryClient, rootId, activityId),
    });
    const create = useConfiguredMutation((data) => fractalApi.createActivityProgressView(rootId, activityId, data));
    const update = useConfiguredMutation(({ viewId, ...data }) => fractalApi.updateActivityProgressView(rootId, activityId, viewId, data));
    const remove = useConfiguredMutation((viewId) => fractalApi.deleteActivityProgressView(rootId, activityId, viewId));
    const activate = useConfiguredMutation((viewId) => fractalApi.activateActivityProgressView(rootId, activityId, viewId));
    return {
        createView: (data) => create.mutateAsync(data),
        updateView: (data) => update.mutateAsync(data),
        deleteView: (viewId) => remove.mutateAsync(viewId),
        activateView: (viewId) => activate.mutateAsync(viewId),
        isPending: create.isPending || update.isPending || remove.isPending || activate.isPending,
    };
}

export function useActivityTagMutations(rootId, activityId) {
    const queryClient = useQueryClient();
    const invalidate = () => invalidateProgress(queryClient, rootId, activityId);
    const create = useMutation({
        mutationFn: (data) => fractalApi.createActivityTag(rootId, activityId, data),
        onSuccess: invalidate,
    });
    const update = useMutation({
        mutationFn: ({ tagId, ...data }) => fractalApi.updateActivityTag(rootId, activityId, tagId, data),
        onSuccess: invalidate,
    });
    const archive = useMutation({
        mutationFn: (tagId) => fractalApi.archiveActivityTag(rootId, activityId, tagId),
        onSuccess: invalidate,
    });
    const assignInstance = useMutation({
        mutationFn: ({ instanceId, tagIds }) => fractalApi.replaceActivityInstanceTags(rootId, instanceId, tagIds),
        onSuccess: invalidate,
    });
    const assignSet = useMutation({
        mutationFn: ({ setId, tagIds }) => fractalApi.replaceActivitySetTags(rootId, setId, tagIds),
        onSuccess: invalidate,
    });
    return {
        createTag: (data) => create.mutateAsync(data),
        updateTag: (data) => update.mutateAsync(data),
        archiveTag: (tagId) => archive.mutateAsync(tagId),
        assignInstanceTags: (data) => assignInstance.mutateAsync(data),
        assignSetTags: (data) => assignSet.mutateAsync(data),
        isPending: create.isPending || update.isPending || archive.isPending || assignInstance.isPending || assignSet.isPending,
    };
}
