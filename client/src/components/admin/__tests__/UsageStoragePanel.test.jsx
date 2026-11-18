import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import UsageStoragePanel from '../UsageStoragePanel';

const { pruneUsage, updateUsageRetention, notify } = vi.hoisted(() => ({
    pruneUsage: vi.fn(),
    updateUsageRetention: vi.fn(),
    notify: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../utils/api', () => ({
    adminApi: {
        pruneUsage: (...args) => pruneUsage(...args),
        updateUsageRetention: (...args) => updateUsageRetention(...args),
    },
}));

vi.mock('../../../utils/notify', () => ({ default: notify }));

const STORAGE = {
    database: {
        total_bytes: 23173504,
        relation_bytes: 11534336,
        other_bytes: 11639168,
        quota_bytes: 500 * 1024 * 1024,
        relations: [
            {
                schema: 'public',
                table: 'event_logs',
                estimated_rows: 2306,
                total_bytes: 2998272,
                table_bytes: 1892352,
                index_bytes: 1064960,
                toast_bytes: 40960,
            },
        ],
    },
    tables: [
        { table: 'product_events', rows: 120, bytes: 65536, oldest: '2026-06-01T00:00:00Z', newest: '2026-07-07T00:00:00Z' },
        { table: 'event_logs', rows: 900, bytes: null, oldest: null, newest: null },
    ],
    event_log_payloads: [
        { event_type: 'session.updated', events: 400, payload_bytes: 2 * 1024 * 1024, description_bytes: 20480 },
    ],
};
const RETENTION = { live_days: 35, product_events_ceiling_days: 180, web_events_ceiling_days: 90 };
const RECENT_EXPORT = {
    last_run_at: new Date().toISOString(),
    last_run_status: 'success',
    last_success_at: new Date().toISOString(),
    last_run_flushed: { product_events: 12, web_events: 3 },
    tables: {},
};

function renderPanel(overrides = {}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <UsageStoragePanel
                storage={STORAGE}
                retention={RETENTION}
                exportState={{ last_run_at: null, last_run_status: null, tables: {} }}
                {...overrides}
            />
        </QueryClientProvider>,
    );
}

describe('UsageStoragePanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updateUsageRetention.mockResolvedValue({ data: { live_days: 60 } });
        pruneUsage.mockResolvedValue({ data: { deleted: 4, live_days: 35, flushed: { product_events: 4, web_events: 0 } } });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    it('renders table stats with human-readable and missing sizes', () => {
        renderPanel();

        expect(screen.getByText('Database storage')).toBeInTheDocument();
        expect(screen.getByText('public.event_logs')).toBeInTheDocument();
        expect(screen.getByText(/Total database storage: 22.1 MB/)).toBeInTheDocument();
        expect(screen.getByText('product_events')).toBeInTheDocument();
        expect(screen.getByText('64.0 KB')).toBeInTheDocument();
        expect(screen.getByText('n/a')).toBeInTheDocument();
        expect(screen.getByText(/Never exported/)).toBeInTheDocument();
    });

    it('shows the database against its quota, warning near the limit', () => {
        const { rerender } = renderPanel();
        expect(screen.getByText(/of 500.0 MB database quota \(4%\)/)).toBeInTheDocument();
        expect(screen.queryByText(/near its storage quota/)).not.toBeInTheDocument();

        rerender(
            <QueryClientProvider client={new QueryClient()}>
                <UsageStoragePanel
                    storage={{ ...STORAGE, database: { ...STORAGE.database, total_bytes: 420 * 1024 * 1024 } }}
                    retention={RETENTION}
                    exportState={RECENT_EXPORT}
                />
            </QueryClientProvider>,
        );
        expect(screen.getByText(/near its storage quota/)).toBeInTheDocument();
    });

    it('lists activity history sizes by event type', () => {
        renderPanel();

        const row = screen.getByRole('row', { name: /session\.updated/ });
        expect(row).toHaveTextContent('400');
        expect(row).toHaveTextContent('2.0 MB');
    });

    it('saves the live window through the API', async () => {
        renderPanel();

        fireEvent.change(screen.getByLabelText('Keep in Postgres after export (days)'), { target: { value: '60' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Live Window' }));

        await waitFor(() => {
            expect(updateUsageRetention).toHaveBeenCalledWith({ live_days: 60 });
        });
        expect(notify.success).toHaveBeenCalled();
    });

    it('flushes exported events after confirmation', async () => {
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Flush Exported Events' }));
        expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/Only events already in BigQuery are deleted/));

        await waitFor(() => {
            expect(pruneUsage).toHaveBeenCalledWith({});
        });
        expect(notify.success).toHaveBeenCalled();
    });

    it('does not flush when the confirmation is dismissed', () => {
        window.confirm.mockReturnValue(false);
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Flush Exported Events' }));

        expect(pruneUsage).not.toHaveBeenCalled();
    });

    it('shows the last export run and what it flushed', () => {
        renderPanel({ exportState: RECENT_EXPORT });

        expect(screen.getByText(/success\) · flushed product_events 12, web_events 3/)).toBeInTheDocument();
        expect(screen.queryByText(/Never exported/)).not.toBeInTheDocument();
    });
});
