import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LogsModal from '../LogsModal';
import { queryKeys } from '../../../hooks/queryKeys';

const getLogs = vi.fn();
const clearLogs = vi.fn();

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        getLogs: (...args) => getLogs(...args),
        clearLogs: (...args) => clearLogs(...args),
    },
}));

vi.mock('../../atoms/Modal', () => ({
    default: function Modal({ isOpen, children }) {
        if (!isOpen) {
            return null;
        }

        return <div>{children}</div>;
    },
}));

vi.mock('../../atoms/ModalBody', () => ({
    default: function ModalBody({ children }) {
        return <div>{children}</div>;
    },
}));

vi.mock('../../atoms/ModalFooter', () => ({
    default: function ModalFooter({ children }) {
        return <div>{children}</div>;
    },
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

function renderModal(queryClient) {
    return render(
        <QueryClientProvider client={queryClient}>
            <LogsModal
                isOpen={true}
                onClose={vi.fn()}
                rootId="root-1"
            />
        </QueryClientProvider>
    );
}

describe('LogsModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads more log pages through a single infinite query cache entry', async () => {
        const queryClient = createQueryClient();
        const firstPageLogs = Array.from({ length: 50 }, (_, index) => ({
            id: `log-${index + 1}`,
            timestamp: `2026-03-08T12:${String(index).padStart(2, '0')}:00Z`,
            event_type: 'session.updated',
            description: index === 0 ? 'Updated session' : `Updated session ${index + 1}`,
            source: 'system',
        }));

        getLogs
            .mockResolvedValueOnce({
                data: {
                    logs: firstPageLogs,
                    pagination: {
                        limit: 50,
                        offset: 0,
                        total: 51,
                        count: 50,
                        has_more: true,
                    },
                },
            })
            .mockResolvedValueOnce({
                data: {
                    logs: [{ id: 'log-51', timestamp: '2026-03-08T13:01:00Z', event_type: 'goal.completed', description: 'Completed goal', source: 'system' }],
                    pagination: {
                        limit: 50,
                        offset: 50,
                        total: 51,
                        count: 1,
                        has_more: false,
                    },
                },
            });

        renderModal(queryClient);

        await waitFor(() => {
            expect(screen.getByText('Updated session')).toBeInTheDocument();
        });

        expect(getLogs).toHaveBeenCalledWith('root-1', expect.objectContaining({
            include_event_types: false,
            limit: 50,
            offset: 0,
        }));

        fireEvent.click(screen.getByText('Load More'));

        await waitFor(() => {
            expect(screen.getByText('Completed goal')).toBeInTheDocument();
        });

        expect(getLogs).toHaveBeenNthCalledWith(2, 'root-1', expect.objectContaining({
            include_event_types: false,
            limit: 50,
            offset: 50,
        }));

        expect(queryClient.getQueryData(queryKeys.logsInfinite('root-1', 50))).toMatchObject({
            pages: [
                { logs: firstPageLogs },
                { logs: [{ id: 'log-51', timestamp: '2026-03-08T13:01:00Z', event_type: 'goal.completed', description: 'Completed goal', source: 'system' }] },
            ],
        });
    });
});
