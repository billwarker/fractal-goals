import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import Analytics from '../Analytics';

const navigate = vi.fn();
const createAnalyticsView = vi.fn();
const updateAnalyticsView = vi.fn();
const deleteAnalyticsView = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useParams: () => ({ rootId: 'root-1' }),
        useNavigate: () => navigate,
    };
});

vi.mock('../../hooks/useAnalyticsPageData', () => ({
    useAnalyticsPageData: () => ({
        activities: [],
        activityGroups: [],
        activityInstances: {},
        goalAnalytics: { summary: {}, goals: [] },
        loading: false,
        sessions: [],
    }),
}));

vi.mock('../../hooks/useDashboardQueries', () => ({
    useAnalyticsViews: () => ({
        analyticsViews: [],
        createAnalyticsView,
        updateAnalyticsView,
        deleteAnalyticsView,
    }),
}));

vi.mock('../../components/analytics/ProfileWindow', () => ({
    default: () => <div>Analytics panel</div>,
}));

describe('Analytics page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createAnalyticsView.mockResolvedValue({
            id: 'view-1',
            name: 'My Saved View',
        });
    });

    it('creates a saved analytics view from Empty View', async () => {
        render(<Analytics />);

        expect(screen.getByText('Empty View')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Save View' }));
        });

        expect(await screen.findByText('Save Analytics View')).toBeInTheDocument();

        await act(async () => {
            fireEvent.change(screen.getByPlaceholderText('Enter a name'), {
                target: { value: 'My Saved View' },
            });
        });

        await act(async () => {
            const nameInput = screen.getByPlaceholderText('Enter a name');
            const form = nameInput.closest('form');
            fireEvent.submit(form);
        });

        await waitFor(() => {
            expect(createAnalyticsView).toHaveBeenCalledWith({
                name: 'My Saved View',
                layout: {
                    version: 1,
                    layout: { type: 'window', id: 'window-1' },
                    window_states: {
                        'window-1': expect.objectContaining({
                            selectedCategory: null,
                            selectedVisualization: null,
                        }),
                    },
                    selected_window_id: 'window-1',
                },
            });
        });
    });
});
