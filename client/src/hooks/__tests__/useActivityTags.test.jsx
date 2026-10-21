import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
    useActivityProgressTimeline,
    useActivityTagCatalogMutations,
    useActivityTagMutations,
    useProgressComparisonMutation,
} from '../useActivityTags';
import { queryKeys } from '../queryKeys';

const api = vi.hoisted(() => ({
    replaceActivityInstanceTags: vi.fn(),
    mergeActivityTagCatalogItems: vi.fn(),
    setActivityInstanceProgressComparison: vi.fn(),
    getActivityProgressTimeline: vi.fn(),
}));

vi.mock('../../utils/api', () => ({ fractalApi: api }));

const createClient = () => new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

beforeEach(() => vi.clearAllMocks());

describe('useActivityTagMutations', () => {
    it('refreshes session instances, the catalog, and the timeline after assigning tags', async () => {
        const queryClient = createClient();
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
        api.replaceActivityInstanceTags.mockResolvedValueOnce({ data: { tags: [], version: 2 } });
        const { result } = renderHook(() => useActivityTagMutations('root-1', 'activity-1'), { wrapper: createWrapper(queryClient) });

        await act(() => result.current.assignInstanceTags({ instanceId: 'instance-1', tagIds: ['tag-1'] }));

        expect(api.replaceActivityInstanceTags).toHaveBeenCalledWith('root-1', 'instance-1', ['tag-1'], undefined);
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessionActivitiesRoot('root-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.activityTagCatalog('root-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.activityProgressTimelineRoot('root-1', 'activity-1'),
            refetchType: 'all',
        });
    });
});

describe('useActivityTagCatalogMutations', () => {
    it('refetches the catalog and every timeline after a merge', async () => {
        const queryClient = createClient();
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
        api.mergeActivityTagCatalogItems.mockResolvedValueOnce({ data: { id: 'target' } });
        const { result } = renderHook(() => useActivityTagCatalogMutations('root-1'), { wrapper: createWrapper(queryClient) });

        const payload = { target_id: 'target', source_ids: ['source'], versions: { target: 1, source: 1 } };
        await act(() => result.current.mergeTags(payload));

        expect(api.mergeActivityTagCatalogItems).toHaveBeenCalledWith('root-1', payload);
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.activityTagCatalog('root-1') });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['activity-progress-timeline', 'root-1'], refetchType: 'all' });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.progressRoot() });
    });
});

describe('useProgressComparisonMutation', () => {
    it('sends only the chosen tags for a specific-tags comparison', async () => {
        const queryClient = createClient();
        api.setActivityInstanceProgressComparison.mockResolvedValue({ data: {} });
        const { result } = renderHook(() => useProgressComparisonMutation('root-1', 'activity-1'), { wrapper: createWrapper(queryClient) });

        await act(() => result.current.setComparison({ instanceId: 'instance-1', mode: 'tags', tagIds: ['a'], version: 3 }));
        await act(() => result.current.setComparison({ instanceId: 'instance-1', mode: 'all', tagIds: ['ignored'] }));

        expect(api.setActivityInstanceProgressComparison).toHaveBeenNthCalledWith(1, 'root-1', 'instance-1', { mode: 'tags', tag_ids: ['a'], version: 3 });
        expect(api.setActivityInstanceProgressComparison).toHaveBeenNthCalledWith(2, 'root-1', 'instance-1', { mode: 'all', tag_ids: [] });
    });
});

describe('useActivityProgressTimeline', () => {
    it('reads one instance comparison context and previews an unsaved choice', async () => {
        api.getActivityProgressTimeline.mockResolvedValue({ data: { items: [{ id: 'a' }], total: 1, total_all: 4, offset: 0 } });
        const { result } = renderHook(
            () => useActivityProgressTimeline('root-1', 'activity-1', { instanceId: 'instance-1', preview: { mode: 'tags', tagIds: ['b', 'a'] } }),
            { wrapper: createWrapper(createClient()) },
        );

        await waitFor(() => expect(result.current.data?.combined.items).toHaveLength(1));
        expect(api.getActivityProgressTimeline).toHaveBeenCalledWith('root-1', 'activity-1', {
            instance_id: 'instance-1', mode: 'tags', tag_ids: ['b', 'a'], limit: 20, offset: 0,
        });
        expect(result.current.data.combined.total_all).toBe(4);
        expect(result.current.hasNextPage).toBe(false);
    });
});
