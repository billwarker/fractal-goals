import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

vi.mock('../../hooks/useAnalyticsEngine', () => ({
    useAnalyticsEngine: () => ({
        catalog: {
            datasets: [
                {
                    id: 'sessions',
                    label: 'Sessions',
                    description: 'Session analytics',
                    fields: [
                        { id: 'name', label: 'Name', type: 'string', filterable: true, aggregations: [] },
                        { id: 'duration_seconds', label: 'Duration Seconds', type: 'number', filterable: true, aggregations: ['sum', 'avg'] },
                    ],
                },
            ],
        },
        catalogLoading: false,
        profiles: [],
        profilesLoading: false,
        runQuery: vi.fn(),
        isRunning: false,
        createProfile: vi.fn(),
        updateProfile: vi.fn(),
        deleteProfile: vi.fn(),
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
        Object.defineProperty(window, 'matchMedia', {
            value: vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
            configurable: true,
        });
    });

    afterEach(() => {
        cleanup();
    });

    it('creates a saved analytics view from Empty Analytics View', async () => {
        render(<Analytics />);

        expect(screen.getByText('Empty Analytics View')).toBeInTheDocument();

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
                    version: 3,
                    layout: {
                        type: 'grid',
                        panels: [
                            { id: 'window-1', x: 0, y: 0, w: 96, h: 48 },
                        ],
                    },
                    layout_bounds: { columns: 12, rows: 6 },
                    window_states: {
                        'window-1': {
                            selectedActivity: null,
                            selectedCategory: null,
                            selectedGoal: null,
                            selectedModeIds: [],
                            selectedVisualization: null,
                            visualizationState: {},
                            visualizationStateByKey: {},
                        },
                    },
                    selected_window_id: 'window-1',
                    global_filters: {
                        goals: {
                            goalIds: [],
                            includeDescendants: true,
                            includeInheritedActivities: true,
                        },
                        activities: {
                            activityIds: [],
                            groupIds: [],
                        },
                    },
                },
            });
        });
    });

    it('keeps filters collapsed on mobile even when stored open', () => {
        Object.defineProperty(window, 'matchMedia', {
            value: vi.fn(() => ({
                matches: true,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
            configurable: true,
        });
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(() => 'true'),
                setItem: vi.fn(),
            },
            configurable: true,
        });

        render(<Analytics />);

        expect(screen.getByRole('button', { name: 'Show Filters' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Hide Filters' })).not.toBeInTheDocument();
    });

    it('opens the query console from the analytics header mode switch', async () => {
        render(<Analytics />);

        expect(screen.getByRole('button', { name: 'Save View' })).toBeInTheDocument();
        expect(
            screen.queryByText('Analytics panel') || screen.queryByText('Loading analytics panel...')
        ).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('tab', { name: 'Query Console' }));
        });

        expect(screen.getByRole('heading', { name: 'Query Console', level: 1 })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Analytics query console' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save View' })).not.toBeInTheDocument();
        expect(screen.queryByText('Analytics panel')).not.toBeInTheDocument();
        expect(screen.queryByText('Loading analytics panel...')).not.toBeInTheDocument();
    });
});
