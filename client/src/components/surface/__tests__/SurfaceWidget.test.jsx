import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SurfaceWidget from '../SurfaceWidget';

vi.mock('../../../hooks/useDashboardQueries', () => ({
    useAnalyticsViews: () => ({
        analyticsViewItems: [
            { id: 'view-1', name: 'Sessions' },
            { id: 'view-2', name: 'Goals' },
            {
                id: 'view-3',
                name: 'Bench trend',
                kind: 'view',
                layout: {
                    type: 'analytics_view',
                    version: 1,
                    profile: {
                        selectedCategory: 'activities',
                        selectedVisualization: 'metricTrends',
                        selectedActivity: { id: 'bench', name: 'Bench' },
                        visualizationState: { metrics: ['weight'], setsHandling: 'top', selectedSplit: 'all' },
                    },
                    global_filters: {},
                },
            },
        ],
    }),
}));

vi.mock('../../../hooks/useAnalyticsPageData', () => ({
    useAnalyticsPageData: () => ({
        sessions: [],
        activities: [{ id: 'bench', name: 'Bench', metric_definitions: [{ id: 'weight', name: 'Weight', unit: 'lb' }] }],
        activityGroups: [],
        activityInstances: {
            bench: [{ id: 'i1', completed: true, session_date: '2026-04-20T12:00:00Z', metrics: [{ metric_id: 'weight', value: '200' }] }],
        },
        goalAnalytics: {},
    }),
}));

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalColor: () => '#888' }),
}));

vi.mock('react-chartjs-2', () => ({
    Line: ({ data }) => <div data-testid="line-chart">{data.datasets.map((dataset) => dataset.label).join(',')}</div>,
}));

vi.mock('../../../utils/api', () => ({
    fractalApi: { getActivityGoalConditions: async () => ({ data: { goals: [] } }) },
}));

function renderWithQuery(element) {
    return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>);
}

describe('SurfaceWidget', () => {
    it('bakes the selected analytics view name into the header outside configure mode', () => {
        const { container } = renderWithQuery(
            <SurfaceWidget
                widgetType="analytics"
                state={{ savedViewId: 'view-1' }}
                sharedData={{ rootId: 'root-1' }}
                configureMode={false}
            />
        );

        const chrome = container.querySelector('.surface-widget-chrome');

        expect(chrome).toHaveTextContent('Analytics Panel - Sessions');
        expect(within(chrome).queryByLabelText('Saved analytics view')).not.toBeInTheDocument();
    });

    it('renders the analytics saved-view selector in the widget header', () => {
        const handleStateChange = vi.fn();

        const { container } = renderWithQuery(
            <SurfaceWidget
                widgetType="analytics"
                state={{ savedViewId: 'view-1' }}
                onStateChange={handleStateChange}
                sharedData={{ rootId: 'root-1' }}
                configureMode
                onRemove={vi.fn()}
            />
        );

        const chrome = container.querySelector('.surface-widget-chrome');
        const body = container.querySelector('.surface-widget-body');
        const selector = within(chrome).getByLabelText('Saved analytics view');

        expect(selector).toHaveValue('view-1');
        expect(within(body).queryByLabelText('Saved analytics view')).not.toBeInTheDocument();

        fireEvent.change(selector, { target: { value: 'view-2' } });

        expect(handleStateChange).toHaveBeenCalledWith({
            savedViewId: 'view-2',
            category: null,
            visualization: null,
        });
        expect(screen.getByRole('button', { name: 'Remove Analytics Panel' })).toBeInTheDocument();
    });

    it('renders a saved activity view with its selected activity', async () => {
        renderWithQuery(
            <SurfaceWidget
                widgetType="analytics"
                state={{ savedViewId: 'view-3' }}
                sharedData={{ rootId: 'root-1' }}
                configureMode={false}
            />
        );

        expect(await screen.findByTestId('line-chart')).toHaveTextContent('Weight');
        expect(screen.queryByText(/Select an activity/)).not.toBeInTheDocument();
    });
});
