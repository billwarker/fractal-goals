import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import SurfaceWidget from '../SurfaceWidget';

vi.mock('../../../hooks/useDashboardQueries', () => ({
    useAnalyticsViews: () => ({
        analyticsViewItems: [
            { id: 'view-1', name: 'Sessions' },
            { id: 'view-2', name: 'Goals' },
        ],
    }),
}));

vi.mock('../../../hooks/useAnalyticsPageData', () => ({
    useAnalyticsPageData: () => ({
        sessions: [],
        activities: [],
        activityGroups: [],
        activityInstances: {},
        goalAnalytics: {},
    }),
}));

describe('SurfaceWidget', () => {
    it('bakes the selected analytics view name into the header outside configure mode', () => {
        const { container } = render(
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

        const { container } = render(
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
});
