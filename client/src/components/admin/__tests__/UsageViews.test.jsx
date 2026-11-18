import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import AcquisitionView from '../AcquisitionView';
import EngagementView from '../EngagementView';
import UsageSummaryView from '../UsageSummaryView';
import UsageUsersView from '../UsageUsersView';

const { barChart } = vi.hoisted(() => ({ barChart: vi.fn() }));
vi.mock('react-chartjs-2', () => ({
    Bar: (props) => {
        barChart(props);
        return <div data-testid="bar-chart" />;
    },
}));
vi.mock('../../analytics/ChartJSWrapper', () => ({
    DISABLED_CHART_ANIMATION: { animation: false },
    useChartThemeDefaults: () => ({ gridColor: '#333', textColor: '#ccc', primaryColor: '#4f9cf9', tooltipBg: '#111' }),
}));

const weeks = Array.from({ length: 8 }, (_, index) => ({
    week_start: `2026-10-${String(index * 7 + 1).padStart(2, '0')}`,
    count: index,
    accounts: 10,
}));

const GROWTH = {
    traffic: {
        visitors_by_day: [{ date: '2026-11-17', count: 40 }],
        visitor_days: 200,
        landing_views: 260,
        demo_starts: 50,
        top_referrers: [{ name: 'news.example.com', visitors: 30 }],
        top_campaigns: [],
    },
    funnel: [
        { key: 'visitors', label: 'Visitors', count: 200 },
        { key: 'demo', label: 'Opened the demo', count: 50 },
        { key: 'waitlist', label: 'Joined the waitlist', count: 10 },
        { key: 'invited', label: 'Invited', count: 8 },
        { key: 'signed_up', label: 'Signed up', count: 4 },
        { key: 'first_fractal', label: 'Created a fractal', count: 3 },
        { key: 'activated', label: 'Completed a session within 7 days', count: 2 },
    ],
    wap: { current: weeks[7], previous: weeks[6], weeks },
    feature_adoption: {
        practitioners: 7,
        days: 7,
        features: [{ feature: 'Sessions', users: 7, share: 1 }, { feature: 'Programs', users: 2, share: 0.2857 }],
    },
};

const DATA = {
    window: { start: '2026-10-20', end: '2026-11-18', days: 30 },
    growth: GROWTH,
    active_users: { dau: [{ date: '2026-11-17', count: 3 }], wau: 5, mau: 9 },
    signups_by_day: [{ date: '2026-11-10', count: 2 }, { date: '2026-11-12', count: 1 }],
    top_events: [{ event_name: 'page_view', count: 120, users: 6 }],
    top_pages: [{ path: '/:rootId/goals', count: 80, users: 6 }],
    live_since: { product_events: null, web_events: null },
};

const kpi = (label) => screen.getByText(label, { selector: 'span' }).parentElement;

describe('UsageSummaryView', () => {
    it('leads with the weekly active practitioners and the other headline numbers', () => {
        render(<UsageSummaryView data={DATA} onOpen={vi.fn()} />);

        expect(within(kpi('Weekly active practitioners')).getByText('7')).toBeInTheDocument();
        expect(within(kpi('Weekly active practitioners')).getByText('▲ 1 vs last week')).toBeInTheDocument();
        expect(within(kpi('Practising this week')).getByText('70%')).toBeInTheDocument();
        expect(within(kpi('Visitor → sign-up')).getByText('2%')).toBeInTheDocument();
        expect(within(kpi('Signups in window')).getByText('3')).toBeInTheDocument();
        expect(within(kpi('Page views in window')).getByText('120')).toBeInTheDocument();
    });

    it('previews the top of the funnel and links to the full tabs', () => {
        const onOpen = vi.fn();
        render(<UsageSummaryView data={DATA} onOpen={onOpen} accountCards={[['Fractals', 4]]} />);

        expect(screen.getAllByRole('row')).toHaveLength(1 + 4);
        expect(screen.queryByRole('row', { name: /^Signed up/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open Acquisition →' }));
        fireEvent.click(screen.getByRole('button', { name: 'Open Engagement →' }));
        expect(onOpen.mock.calls).toEqual([['acquisition'], ['engagement']]);
        expect(within(screen.getByRole('list', { name: 'Account totals' })).getByText('Fractals')).toBeInTheDocument();
    });

    it('still shows usage and account numbers without growth data', () => {
        render(<UsageSummaryView data={{ ...DATA, growth: undefined }} onOpen={vi.fn()} accountCards={[['Users', 2]]} />);

        expect(within(kpi('Active last 7 days')).getByText('5')).toBeInTheDocument();
        expect(screen.queryByText('Weekly active practitioners')).not.toBeInTheDocument();
    });
});

describe('AcquisitionView', () => {
    const renderView = (props = {}) => render(
        <AcquisitionView growth={GROWTH} windowStart="2026-10-20" windowEnd="2026-11-18" {...props} />,
    );

    it('shows each conversion step with its rate from the previous step and from visitors', () => {
        renderView();

        const signedUp = screen.getByRole('row', { name: /^Signed up/ });
        expect(within(signedUp).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Signed up', '4', '50%', '2%']);
    });

    it('charts visitors in a compact chart and lists their sources', () => {
        barChart.mockClear();
        renderView();

        const [props] = barChart.mock.calls[0];
        expect(props.data.datasets[0].label).toBe('Visitors');
        expect(props.options.scales.x.title.display).toBe(false);
        expect(screen.getByText('news.example.com')).toBeInTheDocument();
        expect(screen.getByText('No campaign visits yet.')).toBeInTheDocument();
    });

    it('says where visitor days older than Postgres holds have gone', () => {
        const { rerender } = renderView({ webLiveSince: '2026-10-14T03:00:00Z' });
        expect(screen.queryByText(/are in BigQuery/)).not.toBeInTheDocument();

        rerender(<AcquisitionView growth={GROWTH} windowStart="2026-10-20" windowEnd="2026-11-18" webLiveSince="2026-11-01T03:00:00Z" />);
        expect(screen.getByText(/Postgres holds these events from 2026-11-01/)).toBeInTheDocument();
    });
});

describe('EngagementView', () => {
    it('charts weekly practitioners beside daily users, then feature use and top pages', () => {
        barChart.mockClear();
        render(<EngagementView data={DATA} />);

        expect(barChart.mock.calls.map(([props]) => props.data.datasets[0].label)).toEqual(['Practitioners', 'Active users']);
        expect(within(screen.getByRole('row', { name: /^Programs/ })).getByText('29%')).toBeInTheDocument();
        expect(within(screen.getByRole('row', { name: /goals/ })).getByText('80')).toBeInTheDocument();
    });

    it('notes when daily users reach back past what Postgres holds', () => {
        render(<EngagementView data={{ ...DATA, live_since: { product_events: '2026-11-01T00:00:00Z' } }} />);

        expect(screen.getByText(/Postgres holds these events from 2026-11-01/)).toBeInTheDocument();
    });
});

describe('UsageUsersView', () => {
    const PEOPLE = [
        { user_id: '1', username: 'ana', email: 'ana@example.com', last_seen: '2026-11-17T10:00:00Z', page_views: 5, sessions_created: 1, goals_created: 0, total_events: 9 },
        { user_id: '2', username: 'ben', email: 'ben@example.com', last_seen: '2026-11-18T10:00:00Z', page_views: 30, sessions_created: 4, goals_created: 2, total_events: 50 },
        { user_id: '3', username: 'cy', email: 'cy@work.test', last_seen: null, page_views: 12, sessions_created: 0, goals_created: 1, total_events: 12 },
    ];
    const names = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent.split(' ')[0]);

    it('lists the most recently seen first', () => {
        render(<UsageUsersView perUser={PEOPLE} />);

        expect(names()).toEqual(['ben', 'ana', 'cy']);
        expect(screen.getByRole('columnheader', { name: /Last seen/ })).toHaveAttribute('aria-sort', 'descending');
    });

    it('sorts by a column, and again the other way', () => {
        render(<UsageUsersView perUser={PEOPLE} />);

        fireEvent.click(screen.getByRole('button', { name: 'Page views' }));
        expect(names()).toEqual(['ben', 'cy', 'ana']);
        fireEvent.click(screen.getByRole('button', { name: /Page views/ }));
        expect(names()).toEqual(['ana', 'cy', 'ben']);
        expect(screen.getByRole('columnheader', { name: /Page views/ })).toHaveAttribute('aria-sort', 'ascending');
    });

    it('searches by username or email', () => {
        render(<UsageUsersView perUser={PEOPLE} />);

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), { target: { value: 'work.test' } });
        expect(names()).toEqual(['cy']);
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), { target: { value: 'zed' } });
        expect(screen.getByText('No users match that search.')).toBeInTheDocument();
    });
});
