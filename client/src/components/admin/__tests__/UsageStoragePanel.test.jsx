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
    tables: [
        { table: 'product_events', rows: 120, bytes: 65536, oldest: '2026-06-01T00:00:00Z', newest: '2026-07-07T00:00:00Z' },
        { table: 'event_logs', rows: 900, bytes: null, oldest: null, newest: null },
    ],
};

function renderPanel(overrides = {}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <UsageStoragePanel
                storage={STORAGE}
                retention={{ product_events_days: 180 }}
                exportState={{ last_run_at: null, last_run_status: null, tables: {} }}
                {...overrides}
            />
        </QueryClientProvider>,
    );
}

describe('UsageStoragePanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updateUsageRetention.mockResolvedValue({ data: { product_events_days: 90 } });
        pruneUsage.mockResolvedValue({ data: { deleted: 4, older_than_days: 180 } });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    it('renders table stats with human-readable and missing sizes', () => {
        renderPanel();

        expect(screen.getByText('product_events')).toBeInTheDocument();
        expect(screen.getByText('64.0 KB')).toBeInTheDocument();
        expect(screen.getByText('n/a')).toBeInTheDocument();
        expect(screen.getByText(/Never exported/)).toBeInTheDocument();
    });

    it('saves retention through the API', async () => {
        renderPanel();

        fireEvent.change(screen.getByLabelText('Telemetry retention (days)'), { target: { value: '90' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Retention' }));

        await waitFor(() => {
            expect(updateUsageRetention).toHaveBeenCalledWith({ product_events_days: 90 });
        });
        expect(notify.success).toHaveBeenCalled();
    });

    it('prunes after confirmation', async () => {
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Prune Telemetry' }));

        await waitFor(() => {
            expect(pruneUsage).toHaveBeenCalledWith({});
        });
        expect(notify.success).toHaveBeenCalled();
    });

    it('does not prune when the confirmation is dismissed', () => {
        window.confirm.mockReturnValue(false);
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Prune Telemetry' }));

        expect(pruneUsage).not.toHaveBeenCalled();
    });

    it('shows the last export run when present', () => {
        renderPanel({
            exportState: {
                last_run_at: '2026-07-07T08:00:00Z',
                last_run_status: 'success',
                tables: { product_events: { last_ts: '2026-07-07T07:55:00Z' } },
            },
        });

        expect(screen.getByText(/success/)).toBeInTheDocument();
        expect(screen.queryByText(/Never exported/)).not.toBeInTheDocument();
    });
});
