import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useActivityTagCatalogMutations, useActivityTagMutations } from '../useActivityProgressViews';
import { queryKeys } from '../queryKeys';

const replaceActivityInstanceTags = vi.fn();
const mergeActivityTagCatalogItems = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        replaceActivityInstanceTags: (...args) => replaceActivityInstanceTags(...args),
        mergeActivityTagCatalogItems: (...args) => mergeActivityTagCatalogItems(...args),
    },
}));

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('useActivityTagMutations', () => {
    it('refreshes active session instances after replacing inherited tags', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
        replaceActivityInstanceTags.mockResolvedValueOnce({ data: [] });
        const { result } = renderHook(
            () => useActivityTagMutations('root-1', 'activity-1'),
            { wrapper: createWrapper(queryClient) },
        );

        await act(() => result.current.assignInstanceTags({
            instanceId: 'instance-1',
            tagIds: ['tag-1'],
        }));

        expect(replaceActivityInstanceTags).toHaveBeenCalledWith(
            'root-1',
            'instance-1',
            ['tag-1'],
            undefined,
        );
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.sessionActivitiesRoot('root-1'),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.activityTagCatalog('root-1'),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.activityProgressTimelineRoot('root-1', 'activity-1'),
            refetchType: 'all',
        });
    });
});

describe('useActivityTagCatalogMutations', () => {
    it('removes merged sources from every catalog cache before refetching', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const catalogKey = [...queryKeys.activityTagCatalog('root-1'), { includeArchived: true }];
        queryClient.setQueryData(catalogKey, {
            tags: [
                { id: 'target', name: 'Rehab', normalized_name: 'rehab', archived: false },
                { id: 'source', name: 'rehab', normalized_name: 'rehab', archived: false },
            ],
            duplicate_groups: [{ normalized_name: 'rehab', definition_ids: ['target', 'source'] }],
        });
        const merged = {
            id: 'target', name: 'Rehab', normalized_name: 'rehab', archived: false, version: 2,
        };
        mergeActivityTagCatalogItems.mockResolvedValueOnce({ data: merged });
        const { result } = renderHook(
            () => useActivityTagCatalogMutations('root-1'),
            { wrapper: createWrapper(queryClient) },
        );

        await act(() => result.current.mergeTags({
            target_id: 'target', source_ids: ['source'], versions: { target: 1, source: 1 },
        }));

        expect(queryClient.getQueryData(catalogKey)).toEqual({
            tags: [merged],
            duplicate_groups: [],
        });
    });
});
