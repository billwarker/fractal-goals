import React from 'react';
import { render, screen, within } from '@testing-library/react';

import GrowthPanel from '../GrowthPanel';

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

describe('GrowthPanel', () => {
    it('leads with the weekly active practitioners and their change', () => {
        render(<GrowthPanel growth={GROWTH} windowStart="2026-10-20" windowEnd="2026-11-18" />);

        const kpi = screen.getByText('Weekly active practitioners', { selector: 'span' }).parentElement;
        expect(within(kpi).getByText('7')).toBeInTheDocument();
        expect(within(kpi).getByText('▲ 1 vs last week')).toBeInTheDocument();
        expect(screen.getByText('70%')).toBeInTheDocument();
        expect(screen.getByText('of 10 accounts')).toBeInTheDocument();
    });

    it('shows each conversion step with its rate from the previous step and from visitors', () => {
        render(<GrowthPanel growth={GROWTH} windowStart="2026-10-20" windowEnd="2026-11-18" />);

        const signedUp = screen.getByRole('row', { name: /^Signed up/ });
        expect(within(signedUp).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Signed up', '4', '50%', '2%']);
        expect(screen.getAllByText('2%').length).toBeGreaterThan(0);
    });

    it('charts the weekly KPI and daily visitors, and lists sources and feature use', () => {
        barChart.mockClear();
        render(<GrowthPanel growth={GROWTH} windowStart="2026-10-20" windowEnd="2026-11-18" />);

        const series = barChart.mock.calls.map(([props]) => props.data.datasets[0].label);
        expect(series).toEqual(['Practitioners', 'Visitors']);
        expect(screen.getByText('news.example.com')).toBeInTheDocument();
        expect(screen.getByText('No campaign visits yet.')).toBeInTheDocument();
        expect(within(screen.getByRole('row', { name: /^Programs/ })).getByText('29%')).toBeInTheDocument();
    });

    it('renders nothing before the server sends growth data', () => {
        const { container } = render(<GrowthPanel growth={undefined} />);
        expect(container).toBeEmptyDOMElement();
    });
});
