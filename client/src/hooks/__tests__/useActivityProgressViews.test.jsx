import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useActivityTagMutations } from '../useActivityProgressViews';
import { queryKeys } from '../queryKeys';

const replaceActivityInstanceTags = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        replaceActivityInstanceTags: (...args) => replaceActivityInstanceTags(...args),
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
        );
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.sessionActivitiesRoot('root-1'),
        });
    });
});
