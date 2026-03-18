import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import Sessions from '../Sessions';

const getSessions = vi.fn();
const getActivities = vi.fn();
const getSessionActivities = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessions: (...args) => getSessions(...args),
        getActivities: (...args) => getActivities(...args),
        getSessionActivities: (...args) => getSessionActivities(...args),
    }
}));

vi.mock('../../contexts/TimezoneContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTimezone: () => ({ timezone: 'UTC' })
    };
});

vi.mock('../../contexts/GoalsContext', () => ({
    useGoals: () => ({ setActiveRootId: vi.fn() })
}));

vi.mock('../../hooks/useIsMobile', () => ({
    default: () => false
}));

vi.mock('../../hooks/useActivityQueries', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useActivityGroups: () => ({ activityGroups: [], isLoading: false, error: null })
    };
});

vi.mock('../../hooks/useGoalQueries', () => ({
    useFractalTree: () => ({
        data: { id: 'root-1', name: 'Root', children: [] },
        isLoading: false,
        error: null
    })
}));

vi.mock('../../components/sessions', () => ({
    SessionsQuerySidebar: () => <div data-testid="sessions-query-sidebar" />,
    SessionCardExpanded: ({ sessionActivityInstances = [] }) => (
        <div>instances:{sessionActivityInstances.length}</div>
    )
}));

vi.mock('../../components/sessionDetail', () => ({
    QuickSessionWorkspace: () => <div data-testid="quick-session-modal-content">quick session modal</div>,
}));

vi.mock('../../contexts/ActiveSessionContext', () => ({
    ActiveSessionProvider: ({ children }) => <>{children}</>,
}));

describe('Sessions page data loading', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
            configurable: true
        });
    });

    it('uses embedded session.activity_instances and avoids per-session activity fetches', async () => {
        getSessions.mockResolvedValue({
            data: {
                sessions: [
                    {
                        id: 's1',
                        name: 'Session 1',
                        attributes: { completed: false, session_data: { sections: [] } },
                        activity_instances: [{ id: 'i1' }],
                        notes: []
                    }
                ],
                pagination: { limit: 10, offset: 0, total: 1, has_more: false }
            }
        });
        getActivities.mockResolvedValue({ data: [] });

        renderWithProviders(<Sessions />, {
            route: '/root-1/sessions',
            path: '/:rootId/sessions',
            withTimezone: false,
            withTheme: false
        });

        await waitFor(() => {
            expect(screen.getByText('instances:1')).toBeInTheDocument();
        });

        expect(getSessionActivities).not.toHaveBeenCalled();
    });

    it('renders quick sessions in a sessions-page modal when quickSessionId is present in the route', async () => {
        getSessions.mockResolvedValue({
            data: {
                sessions: [
                    {
                        id: 's1',
                        name: 'Quick Session 1',
                        attributes: {
                            completed: true,
                            updated_at: '2026-03-16T10:00:00Z',
                            session_data: {
                                session_type: 'quick',
                                sections: [],
                            },
                        },
                        activity_instances: [],
                        notes: [],
                    },
                ],
                pagination: { limit: 10, offset: 0, total: 1, has_more: false }
            }
        });
        getActivities.mockResolvedValue({ data: [] });

        renderWithProviders(<Sessions />, {
            route: '/root-1/sessions?quickSessionId=s1',
            path: '/:rootId/sessions',
            withTimezone: false,
            withTheme: false
        });

        await waitFor(() => {
            expect(screen.getByTestId('quick-session-modal-content')).toBeInTheDocument();
        });

        expect(screen.getByRole('dialog', { name: 'Quick session: Quick Session 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close quick session' })).toBeInTheDocument();
    });

    it('closes the quick-session modal on escape', async () => {
        getSessions.mockResolvedValue({
            data: {
                sessions: [
                    {
                        id: 's1',
                        name: 'Quick Session 1',
                        attributes: {
                            completed: true,
                            updated_at: '2026-03-16T10:00:00Z',
                            session_data: {
                                session_type: 'quick',
                                sections: [],
                            },
                        },
                        activity_instances: [],
                        notes: [],
                    },
                ],
                pagination: { limit: 10, offset: 0, total: 1, has_more: false }
            }
        });
        getActivities.mockResolvedValue({ data: [] });

        renderWithProviders(<Sessions />, {
            route: '/root-1/sessions?quickSessionId=s1',
            path: '/:rootId/sessions',
            withTimezone: false,
            withTheme: false
        });

        const dialog = await screen.findByRole('dialog', { name: 'Quick session: Quick Session 1' });
        fireEvent.keyDown(dialog, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Quick session: Quick Session 1' })).not.toBeInTheDocument();
        });
    });
});
