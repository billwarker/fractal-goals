import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import useSessionNotes from '../useSessionNotes';

const mocks = vi.hoisted(() => ({ outbox: { current: null }, createNote: vi.fn() }));
vi.mock('../../offline/OutboxContext', () => ({ useOutbox: () => mocks.outbox.current }));
vi.mock('../../utils/notify', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessionNotes: () => Promise.resolve({ data: [] }),
        getPreviousSessionNotes: () => Promise.resolve({ data: [] }),
        getActivityDefinitionNotes: () => Promise.resolve({ data: [] }),
        createNote: (...args) => mocks.createNote(...args),
    },
}));

const attachment = { id: 'asset', asset_id: 'asset', name: 'run.png', mime_type: 'image/png', provider: 'dropbox', available: true, alt_text: 'Run' };

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return renderHook(() => useSessionNotes('root', 'session'), { wrapper });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.outbox.current = null;
});

describe('useSessionNotes attachments', () => {
    it('queues ids for the server while the optimistic note keeps full attachment metadata', async () => {
        const submit = vi.fn().mockResolvedValue(undefined);
        mocks.outbox.current = { submit };
        const { result } = setup();
        await act(() => result.current.addNote({ context_type: 'session', session_id: 'session', content: 'Run', attachments: [attachment] }));
        const op = submit.mock.calls[0][0];
        expect(op.body.attachments).toEqual([{ asset_id: 'asset', alt_text: 'Run' }]);
        expect(op.meta.note.attachments).toEqual([attachment]);
    });

    it('sends ids and descriptions when saving online', async () => {
        mocks.createNote.mockResolvedValue({ data: { id: 'note', session_id: 'session' } });
        const { result } = setup();
        await act(() => result.current.addNote({ session_id: 'session', content: 'Run', attachments: [attachment] }));
        expect(mocks.createNote).toHaveBeenCalledWith('root', {
            session_id: 'session', content: 'Run', attachments: [{ asset_id: 'asset', alt_text: 'Run' }],
        });
    });
});
