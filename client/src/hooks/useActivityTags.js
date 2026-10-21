import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useOutbox } from '../offline/OutboxContext';
import { SESSION_OP } from '../offline/opKinds';
import { findSessionForActivity } from '../offline/sessionCache';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

const EMPTY_CATALOG = Object.freeze({ families: [], tags: [] });

const invalidateProgress = (queryClient, rootId, activityId = null) => Promise.all([
    queryClient.invalidateQueries({
        queryKey: activityId
            ? queryKeys.activityProgressTimelineRoot(rootId, activityId)
            : ['activity-progress-timeline', rootId],
        refetchType: 'all',
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.progressRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessionActivitiesRoot(rootId) }),
    queryClient.invalidateQueries({ queryKey: ['circuit-runs', rootId] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.programMetricsRoot(rootId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.programDayReadModelRoot(rootId) }),
]);

const invalidateCatalogAndProgress = (queryClient, rootId, activityId = null) => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.activityTagCatalog(rootId) }),
    invalidateProgress(queryClient, rootId, activityId),
]);

/** The fractal's tag families and tags, already in picker order. */
export function useActivityTagCatalog(rootId, { includeArchived = true } = {}) {
    const query = useQuery({
        queryKey: [...queryKeys.activityTagCatalog(rootId), { includeArchived }],
        enabled: Boolean(rootId),
        queryFn: async () => {
            const response = await fractalApi.getActivityTagCatalog(rootId, {
                include_archived: includeArchived,
            });
            return response.data;
        },
    });
    return { ...query, data: query.data || EMPTY_CATALOG };
}

export function useActivityTagCatalogMutations(rootId) {
    const queryClient = useQueryClient();
    const invalidate = () => invalidateCatalogAndProgress(queryClient, rootId);
    const useCatalogMutation = (mutationFn) => useMutation({ mutationFn, onSuccess: invalidate });
    const mutations = {
        createTag: useCatalogMutation((data) => fractalApi.createActivityTagCatalogItem(rootId, data)),
        updateTag: useCatalogMutation(({ definitionId, ...data }) => (
            fractalApi.updateActivityTagCatalogItem(rootId, definitionId, data)
        )),
        reorderTags: useCatalogMutation((data) => fractalApi.reorderActivityTags(rootId, data)),
        archiveTag: useCatalogMutation(({ definitionId, version }) => (
            fractalApi.archiveActivityTagCatalogItem(rootId, definitionId, version)
        )),
        restoreTag: useCatalogMutation(({ definitionId, version }) => (
            fractalApi.restoreActivityTagCatalogItem(rootId, definitionId, version)
        )),
        hardDeleteTag: useCatalogMutation(({ definitionId, ...data }) => (
            fractalApi.hardDeleteActivityTagCatalogItem(rootId, definitionId, data)
        )),
        mergeTags: useCatalogMutation((data) => fractalApi.mergeActivityTagCatalogItems(rootId, data)),
        createFamily: useCatalogMutation((data) => fractalApi.createActivityTagFamily(rootId, data)),
        updateFamily: useCatalogMutation(({ familyId, ...data }) => (
            fractalApi.updateActivityTagFamily(rootId, familyId, data)
        )),
        deleteFamily: useCatalogMutation(({ familyId, version }) => (
            fractalApi.deleteActivityTagFamily(rootId, familyId, version)
        )),
        reorderFamilies: useCatalogMutation((familyIds) => fractalApi.reorderActivityTagFamilies(rootId, familyIds)),
    };
    return {
        ...Object.fromEntries(Object.entries(mutations).map(([name, mutation]) => [name, mutation.mutateAsync])),
        isPending: Object.values(mutations).some((mutation) => mutation.isPending),
    };
}

/**
 * Past instances of an activity in one comparison context, newest first.
 * With instanceId the context is that instance's saved one; ``preview`` ({mode, tagIds})
 * shows an unsaved choice without changing anything.
 */
export function useActivityProgressTimeline(rootId, activityId, {
    instanceId = null,
    preview = null,
    limit = 20,
} = {}) {
    const previewKey = preview ? `${preview.mode}:${[...(preview.tagIds || [])].sort().join(',')}` : null;
    return useInfiniteQuery({
        queryKey: [...queryKeys.activityProgressTimeline(rootId, activityId, instanceId), limit, previewKey],
        enabled: Boolean(rootId && activityId),
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => {
            const response = await fractalApi.getActivityProgressTimeline(rootId, activityId, {
                ...(instanceId ? { instance_id: instanceId } : {}),
                ...(preview ? { mode: preview.mode, tag_ids: preview.mode === 'tags' ? preview.tagIds || [] : [] } : {}),
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
                combined: {
                    ...firstPage,
                    items: result.pages.flatMap((page) => page.items || []),
                },
            };
        },
    });
}

export function useActivityTagMutations(rootId, activityId) {
    const queryClient = useQueryClient();
    const outbox = useOutbox();
    // In a cached session, tag assignments queue like any in-session write (last write wins, so no version).
    const queueAssignment = async ({ kind, instanceId = null, setId = null, tagIds, tags }) => {
        const found = outbox && findSessionForActivity(queryClient, rootId, { instanceId, setId });
        if (!found) return null;
        const entityId = setId || found.instanceId;
        await outbox.submit({
            scope: found.sessionId,
            kind,
            method: 'put',
            url: setId ? `/${rootId}/activity-sets/${setId}/tags` : `/${rootId}/activity-instances/${found.instanceId}/tags`,
            body: { tag_ids: tagIds },
            coalesceKey: `tags:${entityId}`,
            entityIds: [found.instanceId, ...(setId ? [setId] : [])],
            meta: { rootId, sessionId: found.sessionId, instanceId: found.instanceId, setId, tags: tags || [] },
        });
        return { data: {} };
    };
    const invalidate = () => invalidateCatalogAndProgress(queryClient, rootId, activityId);
    const useInvalidatingMutation = (mutationFn) => useMutation({ mutationFn, onSuccess: invalidate });
    const create = useInvalidatingMutation((data) => fractalApi.createActivityTagCatalogItem(rootId, {
        name: data.name,
        ...(data.color ? { color: data.color } : {}),
        ...(data.familyId ? { family_id: data.familyId } : {}),
    }));
    const restore = useInvalidatingMutation(({ definitionId, version }) => (
        fractalApi.restoreActivityTagCatalogItem(rootId, definitionId, version)
    ));
    const assignInstance = useInvalidatingMutation(({ instanceId, tagIds, version }) => (
        fractalApi.replaceActivityInstanceTags(rootId, instanceId, tagIds, version)
    ));
    const assignSet = useInvalidatingMutation(({ setId, tagIds, version }) => (
        fractalApi.replaceActivitySetTags(rootId, setId, tagIds, version)
    ));
    return {
        createTag: (data) => create.mutateAsync(data),
        restoreTag: (data) => restore.mutateAsync(data),
        assignInstanceTags: async (data) => (
            await queueAssignment({ kind: SESSION_OP.INSTANCE_TAGS, ...data }) || assignInstance.mutateAsync(data)
        ),
        assignSetTags: async (data) => (
            await queueAssignment({ kind: SESSION_OP.SET_TAGS, ...data }) || assignSet.mutateAsync(data)
        ),
        isPending: create.isPending || restore.isPending || assignInstance.isPending || assignSet.isPending,
    };
}

/** Choose what one instance compares against: 'same_tags' (default), 'tags', or 'all'. */
export function useProgressComparisonMutation(rootId, activityId) {
    const queryClient = useQueryClient();
    const outbox = useOutbox();
    const mutation = useMutation({
        mutationFn: ({ instanceId, mode, tagIds = [], version }) => fractalApi.setActivityInstanceProgressComparison(
            rootId, instanceId, { mode, tag_ids: mode === 'tags' ? tagIds : [], ...(version ? { version } : {}) },
        ),
        onSuccess: () => invalidateProgress(queryClient, rootId, activityId),
    });
    const setComparison = async ({ instanceId, mode, tagIds = [], tags = [], version }) => {
        const found = outbox && findSessionForActivity(queryClient, rootId, { instanceId });
        if (found) {
            await outbox.submit({
                scope: found.sessionId,
                kind: SESSION_OP.PROGRESS_COMPARISON,
                method: 'put',
                url: `/${rootId}/activity-instances/${instanceId}/progress-comparison`,
                body: { mode, tag_ids: mode === 'tags' ? tagIds : [] },
                coalesceKey: `progress-comparison:${instanceId}`,
                entityIds: [instanceId],
                meta: {
                    rootId,
                    sessionId: found.sessionId,
                    instanceId,
                    comparisonContext: { mode, tag_ids: mode === 'tags' ? tagIds : [], tags: mode === 'tags' ? tags : [] },
                },
            });
            await invalidateProgress(queryClient, rootId, activityId);
            return { data: {} };
        }
        return mutation.mutateAsync({ instanceId, mode, tagIds, version });
    };
    return { setComparison, isPending: mutation.isPending };
}
