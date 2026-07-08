import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import UsagePanel from '../UsagePanel';

const { getUsage } = vi.hoisted(() => ({
    getUsage: vi.fn(),
}));

vi.mock('../../../utils/api', () => ({
    adminApi: {
        getUsage: (...args) => getUsage(...args),
    },
}));

const USAGE_FIXTURE = {
    window_days: 30,
    active_users: {
        dau: [
            { date: '2026-07-06', count: 0 },
            { date: '2026-07-07', count: 2 },
        ],
        wau: 2,
        mau: 3,
    },
    signups_by_day: [{ date: '2026-07-05', count: 1 }],
    per_user: [
        {
            user_id: 'user-1',
            username: 'will',
            email: 'will@example.com',
            last_login_at: '2026-07-07T10:00:00Z',
            last_seen: '2026-07-07T12:00:00Z',
            page_views: 14,
            sessions_created: 3,
            goals_created: 5,
        },
    ],
    top_events: [
        { event_name: 'page_view', count: 14, users: 1 },
        { event_name: 'settings_opened', count: 2, users: 1 },
    ],
    top_pages: [
        { path: '/:rootId/goals', count: 9, users: 1 },
        { path: '/:rootId/analytics', count: 5, users: 1 },
    ],
    email_health: [
        { template_key: 'beta_invite', status: 'delivered', count: 4 },
    ],
};

function renderPanel() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <UsagePanel enabled={true} />
        </QueryClientProvider>,
    );
}

describe('UsagePanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getUsage.mockResolvedValue({ data: USAGE_FIXTURE });
    });

    it('renders active-user summary, per-user table, top pages, and email health', async () => {
        renderPanel();

        await waitFor(() => {
            expect(screen.getByText('Active last 7 days')).toBeInTheDocument();
        });
        expect(getUsage).toHaveBeenCalledWith({ days: 30 });

        expect(screen.getByText('will (will@example.com)')).toBeInTheDocument();
        expect(screen.getByText('/:rootId/goals')).toBeInTheDocument();
        expect(screen.getByText('/:rootId/analytics')).toBeInTheDocument();
        expect(screen.getByText('beta_invite')).toBeInTheDocument();
        expect(screen.getByText('delivered')).toBeInTheDocument();
    });

    it('refetches with the selected window', async () => {
        renderPanel();

        await waitFor(() => {
            expect(screen.getByText('Active last 7 days')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: '7 days' }));

        await waitFor(() => {
            expect(getUsage).toHaveBeenCalledWith({ days: 7 });
        });
    });

    it('does not fetch when disabled', () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <UsagePanel enabled={false} />
            </QueryClientProvider>,
        );

        expect(getUsage).not.toHaveBeenCalled();
    });
});
