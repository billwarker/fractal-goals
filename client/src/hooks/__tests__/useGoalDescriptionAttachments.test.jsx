import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGoalDescriptionAttachments } from '../useGoalDescriptionAttachments';

const mocks = vi.hoisted(() => ({ goalAttachments: vi.fn() }));
vi.mock('../../utils/api/storageApi', () => ({ storageApi: mocks }));
vi.mock('../useStorageConnections', () => ({ useStorageConnections: () => ({ providers: [], limits: null }) }));

function setup(enabled = true) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return renderHook(() => useGoalDescriptionAttachments('root', 'goal', enabled), { wrapper });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.goalAttachments.mockResolvedValue({ data: [{ id: 'asset', name: 'form.png', mime_type: 'image/png', provider: 'dropbox', available: true, alt_text: 'Form' }] });
});

describe('useGoalDescriptionAttachments', () => {
    it('loads saved description media into an editable draft', async () => {
        const { result } = setup();
        expect(result.current.loaded).toBe(false);
        await waitFor(() => expect(result.current.loaded).toBe(true));
        await waitFor(() => expect(result.current.draft.payload()).toEqual([{ asset_id: 'asset', alt_text: 'Form' }]));
        act(() => result.current.draft.remove('asset'));
        expect(result.current.draft.payload()).toEqual([]);
        expect(mocks.goalAttachments).toHaveBeenCalledWith('root', 'goal');
    });

    it('does not load for new or read-only goals', () => {
        const { result } = setup(false);
        expect(result.current.loaded).toBe(false);
        expect(mocks.goalAttachments).not.toHaveBeenCalled();
    });
});
