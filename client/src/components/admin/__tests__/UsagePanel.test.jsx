import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';

import UsagePanel from '../UsagePanel';

const { getUsage, barChart } = vi.hoisted(() => ({
    getUsage: vi.fn(),
    barChart: vi.fn(),
}));

vi.mock('react-chartjs-2', () => ({
    Bar: (props) => {
        barChart(props);
        return <div data-testid="dau-bar-chart" />;
    },
}));

vi.mock('../../analytics/ChartJSWrapper', () => ({
    DISABLED_CHART_ANIMATION: { animation: false },
    useChartThemeDefaults: () => ({
        gridColor: '#333',
        textColor: '#ccc',
        primaryColor: '#4f9cf9',
        secondaryColor: '#22c55e',
        tooltipBg: '#111',
    }),
}));

vi.mock('../../../utils/api', () => ({
    adminApi: {
        getUsage: (...args) => getUsage(...args),
        pruneUsage: vi.fn(),
        updateUsageRetention: vi.fn(),
    },
}));

const USAGE_FIXTURE = {
    window: { start: '2026-06-08', end: '2026-07-07', days: 30 },
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
            total_events: 21,
        },
    ],
    events_breakdown: [
        { event_type: 'session.created', domain: 'session', count: 3, users: 1 },
        { event_type: 'note.created', domain: 'note', count: 2, users: 1 },
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
    storage: {
        database: {
            total_bytes: 23173504,
            relation_bytes: 11534336,
            other_bytes: 11639168,
            relations: [
                {
                    schema: 'public',
                    table: 'event_logs',
                    estimated_rows: 900,
                    total_bytes: 2998272,
                    table_bytes: 1892352,
                    index_bytes: 1064960,
                    toast_bytes: 40960,
                },
            ],
        },
        tables: [
            { table: 'product_events', rows: 120, bytes: 65536, oldest: '2026-06-01T00:00:00Z', newest: '2026-07-07T00:00:00Z' },
            { table: 'event_logs', rows: 900, bytes: 262144, oldest: '2026-05-01T00:00:00Z', newest: '2026-07-07T00:00:00Z' },
            { table: 'email_delivery_events', rows: 12, bytes: 8192, oldest: null, newest: null },
            { table: 'email_webhook_events', rows: 10, bytes: 8192, oldest: null, newest: null },
        ],
    },
    retention: { live_days: 35, product_events_ceiling_days: 180, web_events_ceiling_days: 90 },
    export: { last_run_at: null, last_run_status: null, tables: {} },
    growth: {
        traffic: { visitors_by_day: [], visitor_days: 0, landing_views: 0, demo_starts: 0, top_referrers: [], top_campaigns: [] },
        funnel: [{ key: 'visitors', label: 'Visitors', count: 0 }],
        wap: {
            current: { week_start: '2026-07-06', count: 1, accounts: 3 },
            previous: { week_start: '2026-06-29', count: 0, accounts: 3 },
            weeks: [{ week_start: '2026-07-06', count: 1, accounts: 3 }],
        },
        feature_adoption: { practitioners: 1, days: 7, features: [] },
    },
};

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{location.search}</output>;
}

function renderPanel({ path = '/admin', enabled = true } = {}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[path]}>
                <UsagePanel enabled={enabled} accountCards={[['Fractals', 2]]} />
                <LocationProbe />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

const openTab = (name) => fireEvent.click(screen.getByRole('tab', { name }));

describe('UsagePanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getUsage.mockResolvedValue({ data: USAGE_FIXTURE });
    });

    it('fetches with the default 30-day start/end range', async () => {
        renderPanel();

        await waitFor(() => {
            expect(screen.getByText('Active last 7 days')).toBeInTheDocument();
        });
        expect(getUsage).toHaveBeenCalledTimes(1);
        const params = getUsage.mock.calls[0][0];
        expect(params.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(params.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('opens on Summary with the headline numbers and account totals', async () => {
        renderPanel();

        expect(await screen.findByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByRole('tabpanel', { name: 'Summary' })).toBeInTheDocument();
        expect(screen.getByText('Weekly active practitioners', { selector: 'span' })).toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Account totals' })).toHaveTextContent('Fractals');
        expect(screen.queryByText('public.event_logs')).not.toBeInTheDocument();
    });

    it('renders the DAU bar chart with labels and counts on Engagement', async () => {
        renderPanel();
        await screen.findByRole('tab', { name: 'Engagement' });
        barChart.mockClear();

        openTab('Engagement');

        const chartProps = barChart.mock.calls.map(([props]) => props).find((props) => props.data.datasets[0].label === 'Active users');
        expect(chartProps.data.labels).toEqual(['2026-07-06', '2026-07-07']);
        expect(chartProps.data.datasets[0].data).toEqual([0, 2]);
        expect(chartProps.options.scales.y.beginAtZero).toBe(true);
        expect(screen.getByText('/:rootId/goals')).toBeInTheDocument();
    });

    it('shows one area per tab, from a single request', async () => {
        renderPanel();
        await screen.findByRole('tab', { name: 'Users' });

        openTab('Users');
        expect(screen.getByText('will (will@example.com)')).toBeInTheDocument();
        expect(screen.getByText('21')).toBeInTheDocument();
        openTab('Events');
        expect(screen.getByText('session.created')).toBeInTheDocument();
        expect(screen.getByText('note.created')).toBeInTheDocument();
        expect(screen.queryByText('will (will@example.com)')).not.toBeInTheDocument();
        openTab('System');
        expect(screen.getByText('beta_invite')).toBeInTheDocument();
        expect(screen.getByText('public.event_logs')).toBeInTheDocument();
        expect(screen.getByText('product_events')).toBeInTheDocument();
        expect(screen.getByText(/Never exported/)).toBeInTheDocument();

        expect(getUsage).toHaveBeenCalledTimes(1);
    });

    it('keeps the open tab in the URL and reopens it from there', async () => {
        renderPanel({ path: '/admin?view=system' });

        expect(await screen.findByRole('tab', { name: 'System' })).toHaveAttribute('aria-selected', 'true');
        openTab('Acquisition');
        expect(screen.getByTestId('location')).toHaveTextContent('?view=acquisition');
        openTab('Summary');
        expect(screen.getByTestId('location')).toBeEmptyDOMElement();
    });

    it('falls back to Summary for an unknown view', async () => {
        renderPanel({ path: '/admin?view=nonsense' });

        expect(await screen.findByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
    });

    it('notes when the daily users chart reaches back past what Postgres holds', async () => {
        getUsage.mockResolvedValue({ data: { ...USAGE_FIXTURE, live_since: { product_events: '2026-06-20T00:00:00Z', web_events: null } } });
        renderPanel({ path: '/admin?view=engagement' });

        expect(await screen.findByText(/Postgres holds these events from 2026-06-20/)).toBeInTheDocument();
    });

    it('refetches when a different preset range is selected', async () => {
        renderPanel();

        await waitFor(() => {
            expect(screen.getByText('Active last 7 days')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: '7D' }));

        await waitFor(() => {
            expect(getUsage).toHaveBeenCalledTimes(2);
        });
    });

    it('does not fetch when disabled', () => {
        renderPanel({ enabled: false });

        expect(getUsage).not.toHaveBeenCalled();
    });
});
