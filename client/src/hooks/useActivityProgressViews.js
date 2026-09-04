import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

const invalidateProgress = (queryClient, rootId, activityId) => Promise.all([
    queryClient.invalidateQueries({
        queryKey: queryKeys.activityProgressTimelineRoot(rootId, activityId),
        refetchType: 'all',
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.progressRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessionActivitiesRoot(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.programMetricsRoot(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.programDayReadModelRoot(rootId) }),
]);

const invalidateTagsAndProgress = (queryClient, rootId, activityId) => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.activityTagCatalog(rootId) }),
    invalidateProgress(queryClient, rootId, activityId),
]);

const invalidateCatalogAndProgress = (queryClient, rootId) => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.activityTagCatalog(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activities(rootId) }),
    queryClient.invalidateQueries({ queryKey: ['activity-tags', rootId] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessionActivitiesRoot(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.progressRoot() }),
]);

const reconcileMergedCatalog = (catalog, mergedTag, sourceIds) => {
    if (!catalog?.tags || !mergedTag) return catalog;
    const removedIds = new Set(sourceIds);
    const tags = catalog.tags
        .filter((tag) => tag.id !== mergedTag.id && !removedIds.has(tag.id))
        .concat(mergedTag);
    const groups = new Map();
    tags.filter((tag) => !tag.archived).forEach((tag) => {
        const ids = groups.get(tag.normalized_name) || [];
        groups.set(tag.normalized_name, [...ids, tag.id]);
    });
    return {
        ...catalog,
        tags,
        duplicate_groups: [...groups.entries()]
            .filter(([, definitionIds]) => definitionIds.length > 1)
            .map(([normalizedName, definitionIds]) => ({
                normalized_name: normalizedName,
                definition_ids: definitionIds,
            })),
    };
};

export function progressPreviewSignature(config) {
    if (!config) return null;
    return JSON.stringify({
        schema_version: 1,
        all_tag_ids: [...(config.all_tag_ids || [])].sort(),
        any_tag_ids: [...(config.any_tag_ids || [])].sort(),
        none_tag_ids: [...(config.none_tag_ids || [])].sort(),
    });
}

export function useActivityTagCatalog(rootId, { includeArchived = true } = {}) {
    return useQuery({
        queryKey: [...queryKeys.activityTagCatalog(rootId), { includeArchived }],
        enabled: Boolean(rootId),
        queryFn: async () => {
            const response = await fractalApi.getActivityTagCatalog(rootId, {
                include_archived: includeArchived,
            });
            return response.data;
        },
    });
}

export function useActivityTagCatalogMutations(rootId) {
    const queryClient = useQueryClient();
    const invalidate = () => invalidateCatalogAndProgress(queryClient, rootId);
    const create = useMutation({
        mutationFn: (data) => fractalApi.createActivityTagCatalogItem(rootId, data),
        onSuccess: invalidate,
    });
    const update = useMutation({
        mutationFn: ({ definitionId, ...data }) => fractalApi.updateActivityTagCatalogItem(rootId, definitionId, data),
        onSuccess: invalidate,
    });
    const archive = useMutation({
        mutationFn: ({ definitionId, version }) => fractalApi.archiveActivityTagCatalogItem(rootId, definitionId, version),
        onSuccess: invalidate,
    });
    const restore = useMutation({
        mutationFn: ({ definitionId, version }) => fractalApi.restoreActivityTagCatalogItem(rootId, definitionId, version),
        onSuccess: invalidate,
    });
    const hardDelete = useMutation({
        mutationFn: ({ definitionId, ...data }) => fractalApi.hardDeleteActivityTagCatalogItem(rootId, definitionId, data),
        onSuccess: invalidate,
    });
    const merge = useMutation({
        mutationFn: (data) => fractalApi.mergeActivityTagCatalogItems(rootId, data),
        onMutate: () => queryClient.cancelQueries({
            queryKey: queryKeys.activityTagCatalog(rootId),
        }),
        onSuccess: async (response, variables) => {
            queryClient.setQueriesData(
                { queryKey: queryKeys.activityTagCatalog(rootId) },
                (catalog) => reconcileMergedCatalog(catalog, response.data, variables.source_ids),
            );
            await invalidate();
        },
    });
    return {
        createTag: (data) => create.mutateAsync(data),
        updateTag: (data) => update.mutateAsync(data),
        archiveTag: (data) => archive.mutateAsync(data),
        restoreTag: (data) => restore.mutateAsync(data),
        hardDeleteTag: (data) => hardDelete.mutateAsync(data),
        mergeTags: (data) => merge.mutateAsync(data),
        isPending: create.isPending || update.isPending || archive.isPending
            || restore.isPending || hardDelete.isPending || merge.isPending,
    };
}

export function useActivityProgressTimeline(rootId, activityId, {
    excludeSessionId = null,
    draftConfig = null,
    limit = 20,
} = {}) {
    const previewKey = progressPreviewSignature(draftConfig);
    return useInfiniteQuery({
        queryKey: [...queryKeys.activityProgressTimeline(rootId, activityId, excludeSessionId), limit, previewKey],
        enabled: Boolean(rootId && activityId),
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => {
            if (draftConfig) {
                const response = await fractalApi.queryActivityProgress(rootId, activityId, {
                    config: draftConfig,
                    exclude_session_id: excludeSessionId,
                    limit,
                    offset: pageParam,
                });
                return response.data;
            }
            const response = await fractalApi.getActivityProgressTimeline(rootId, activityId, {
                exclude_session_id: excludeSessionId,
                limit,
                offset: pageParam,
            });
            return response.data;
        },
        getNextPageParam: (lastPage) => {
            const nextOffset = Number(lastPage?.offset || 0) + (lastPage?.items?.length || 0);
            return nextOffset < Number(lastPage?.total || 0) ? nextOffset : undefined;
        },
        select: (result) => {
            const firstPage = result.pages[0] || {};
            return {
                ...result,
                pages: result.pages,
                pageParams: result.pageParams,
                combined: {
                    ...firstPage,
                    items: result.pages.flatMap((page) => page.items || []),
                },
            };
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
    const invalidate = () => invalidateTagsAndProgress(queryClient, rootId, activityId);
    const create = useMutation({
        mutationFn: (data) => fractalApi.createActivityTagCatalogItem(rootId, {
            scope: data.scope || 'selected',
            activity_ids: data.scope === 'global' ? [] : [activityId],
            name: data.name,
            ...(data.color ? { color: data.color } : {}),
        }),
        onSuccess: invalidate,
    });
    const archive = useMutation({
        mutationFn: ({ definitionId, version }) => fractalApi.archiveActivityTagCatalogItem(
            rootId, definitionId, version,
        ),
        onSuccess: invalidate,
    });
    const updateCatalog = useMutation({
        mutationFn: ({ definitionId, ...data }) => fractalApi.updateActivityTagCatalogItem(rootId, definitionId, data),
        onSuccess: invalidate,
    });
    const hardDeleteCatalog = useMutation({
        mutationFn: ({ definitionId, ...data }) => fractalApi.hardDeleteActivityTagCatalogItem(rootId, definitionId, data),
        onSuccess: invalidate,
    });
    const assignInstance = useMutation({
        mutationFn: ({ instanceId, tagIds, version }) => fractalApi.replaceActivityInstanceTags(rootId, instanceId, tagIds, version),
        onSuccess: invalidate,
    });
    const assignSet = useMutation({
        mutationFn: ({ setId, tagIds, version }) => fractalApi.replaceActivitySetTags(rootId, setId, tagIds, version),
        onSuccess: invalidate,
    });
    return {
        createTag: (data) => create.mutateAsync(data),
        archiveTag: (data) => archive.mutateAsync(data),
        updateCatalogTag: (data) => updateCatalog.mutateAsync(data),
        hardDeleteCatalogTag: (data) => hardDeleteCatalog.mutateAsync(data),
        assignInstanceTags: (data) => assignInstance.mutateAsync(data),
        assignSetTags: (data) => assignSet.mutateAsync(data),
        isPending: create.isPending || archive.isPending
            || updateCatalog.isPending || hardDeleteCatalog.isPending || assignInstance.isPending || assignSet.isPending,
    };
}
