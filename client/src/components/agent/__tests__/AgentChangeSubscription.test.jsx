import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import AgentChangeSubscription from '../AgentChangeSubscription';
import { queryKeys } from '../../../hooks/queryKeys';

const api = vi.hoisted(() => ({ getChangeCursor: vi.fn() }));
const featureFlags = vi.hoisted(() => ({ ai_agent_connectors: true, ai_agent_embedded: false }));

vi.mock('../../../utils/api', () => ({ agentApi: api }));
vi.mock('../../../hooks/useFeatureFlags', () => ({
    FEATURE_FLAGS: { aiAgentConnectors: 'ai_agent_connectors', aiAgentEmbedded: 'ai_agent_embedded' },
    isFeatureEnabled: (flags, key) => Boolean(flags?.[key]),
    useFeatureFlags: () => ({ flags: featureFlags }),
}));

describe('AgentChangeSubscription', () => {
    let queryClient;

    beforeEach(() => {
        vi.clearAllMocks();
        featureFlags.ai_agent_connectors = true;
        featureFlags.ai_agent_embedded = false;
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, refetchInterval: false } },
        });
        vi.spyOn(queryClient, 'invalidateQueries');
    });

    afterEach(() => queryClient.clear());

    const mount = (rootId, authenticated = true) => render(
        <QueryClientProvider client={queryClient}>
            <AgentChangeSubscription rootId={rootId} authenticated={authenticated} />
        </QueryClientProvider>,
    );

    it('retains the cursor baseline and invalidates the root when another client changes it', async () => {
        api.getChangeCursor.mockResolvedValue({ data: { cursor: 4 } });
        const view = mount('root-a');
        await waitFor(() => expect(queryClient.getQueryData(queryKeys.aiChangeCursor('root-a'))).toBe(4));
        expect(queryClient.getQueryData([...queryKeys.aiChangeCursor('root-a'), 'observed'])).toBe(4);

        await act(async () => {
            queryClient.setQueryData(queryKeys.aiChangeCursor('root-a'), 5);
        });

        await waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.goalsTree('root-a') }));
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.programs('root-a') });
        view.unmount();
        expect(queryClient.getQueryData([...queryKeys.aiChangeCursor('root-a'), 'observed'])).toBe(5);
    });

    it('does not treat a new root or a closed pop-up remount as an unseen change', async () => {
        api.getChangeCursor.mockResolvedValue({ data: { cursor: 9 } });
        const view = mount('root-a');
        await waitFor(() => expect(queryClient.getQueryData(queryKeys.aiChangeCursor('root-a'))).toBe(9));
        view.unmount();
        mount('root-b');
        await waitFor(() => expect(queryClient.getQueryData(queryKeys.aiChangeCursor('root-b'))).toBe(9));
        expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    it('does not poll for unauthenticated layouts and polls the embedded API path', async () => {
        mount('root-a', false);
        expect(api.getChangeCursor).not.toHaveBeenCalled();

        featureFlags.ai_agent_connectors = false;
        featureFlags.ai_agent_embedded = true;
        mount('root-b');
        await waitFor(() => expect(api.getChangeCursor).toHaveBeenCalledWith('root-b'));
    });
});
