import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import Analytics from '../Analytics';

const navigate = vi.fn();
const createAnalyticsView = vi.fn();
const updateAnalyticsView = vi.fn();
const deleteAnalyticsView = vi.fn();
let analyticsSqlExplorerEnabled = true;

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
        analyticsViewItems: [],
        analyticsDashboards: [],
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

vi.mock('../../hooks/useFeatureFlags', () => ({
    FEATURE_FLAGS: {
        analyticsSqlExplorer: 'analytics_sql_explorer',
        goalSurfaceConfiguration: 'goal_surface_configuration',
    },
    useFeatureFlags: () => ({
        flags: {
            analytics_sql_explorer: analyticsSqlExplorerEnabled,
            goal_surface_configuration: false,
        },
    }),
    isFeatureEnabled: (flags, key) => flags?.[key] === true,
}));

vi.mock('../../components/analytics/ProfileWindow', () => ({
    default: () => <div>Analytics panel</div>,
}));

describe('Analytics page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        analyticsSqlExplorerEnabled = true;
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
        expect(screen.queryByRole('contentinfo', { name: 'Analytics sidebar controls' })).not.toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
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
                kind: 'view',
                layout: {
                    type: 'analytics_view',
                    version: 1,
                    profile: {
                        selectedActivity: null,
                        selectedCategory: null,
                        selectedGoal: null,
                        selectedVisualization: null,
                        visualizationState: {},
                        visualizationStateByKey: {},
                    },
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

    it('opens the mobile sidebar from the footer with shared sheet motion, even when stored open', () => {
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

        const footer = screen.getByRole('contentinfo', { name: 'Analytics sidebar controls' });
        expect(footer.parentElement).toBe(document.body);
        const button = within(footer).getByRole('button', { name: 'Show Sidebar' });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', { name: 'Show Filters' })).not.toBeInTheDocument();

        fireEvent.click(button);
        expect(button).toHaveAttribute('aria-expanded', 'true');
        const closeButton = screen.getByRole('button', { name: 'Collapse filters panel' });
        const sheet = closeButton.closest('.sessions-query-sidebar').parentElement;
        expect(sheet.parentElement).toBe(document.body);
        expect(sheet).toHaveClass('mobile-sheet-enter');
        expect(document.querySelector('.mobile-sheet-backdrop-enter')).toBeInTheDocument();
        fireEvent.click(closeButton);
        expect(button).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(screen.getByRole('tab', { name: 'Query Console' }));
        expect(screen.queryByRole('contentinfo', { name: 'Analytics sidebar controls' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Dashboard' }));
        expect(screen.getByRole('contentinfo', { name: 'Analytics sidebar controls' })).toBeInTheDocument();
    });

    it('opens the query console from the analytics header mode switch', async () => {
        render(<Analytics />);

        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        expect(
            screen.queryByText('Analytics panel') || screen.queryByText('Loading analytics panel...')
        ).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('tab', { name: 'Query Console' }));
        });

        expect(screen.getByRole('heading', { name: 'Query Console', level: 1 })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Analytics query console' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Saved Analytics' })).not.toBeInTheDocument();
        expect(screen.queryByText('Analytics panel')).not.toBeInTheDocument();
        expect(screen.queryByText('Loading analytics panel...')).not.toBeInTheDocument();
    });

    it('hides the query console mode when the SQL explorer flag is off', () => {
        analyticsSqlExplorerEnabled = false;

        render(<Analytics />);

        expect(screen.queryByRole('tab', { name: 'Dashboard' })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Query Console' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Analytics query console' })).not.toBeInTheDocument();
    });
});
