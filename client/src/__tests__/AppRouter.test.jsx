import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { NavigationHeader } from '../AppRouter';

const {
    getAllFractals,
    mockIsMobile,
    mockActiveSession,
    mockRootGoal,
    mockUser,
} = vi.hoisted(() => ({
    getAllFractals: vi.fn(),
    mockIsMobile: vi.fn(() => false),
    mockActiveSession: { current: null },
    mockRootGoal: {
        id: 'root-1',
        name: 'First Root',
        type: 'UltimateGoal',
        is_smart: false,
    },
    mockUser: { current: { id: 'user-1', is_admin: false } },
}));

vi.mock('../utils/api', () => ({
    globalApi: {
        getAllFractals: (...args) => getAllFractals(...args),
    },
}));

vi.mock('../hooks/useGoalQueries', () => ({
    useRootGoal: () => ({ data: mockRootGoal }),
}));

vi.mock('../hooks/useSessionQueries', () => ({
    useActiveSession: (_userId, rootId) => ({
        data: mockActiveSession.byRoot?.[rootId] ?? mockActiveSession.current,
    }),
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: mockUser.current,
        isAuthenticated: true,
    }),
}));

vi.mock('../contexts/HeaderContext', () => ({
    HeaderProvider: ({ children }) => children,
    useHeader: () => ({ headerActions: null }),
}));

vi.mock('../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#123456',
        getGoalSecondaryColor: () => '#654321',
        getGoalIcon: () => 'circle',
    }),
}));

vi.mock('../hooks/useIsMobile', () => ({
    default: () => mockIsMobile(),
}));

vi.mock('../components/atoms/GoalIcon', () => ({
    default: function GoalIcon({ className = '' }) {
        return <span className={className} data-testid="goal-icon" />;
    },
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location-path">{location.pathname}</div>;
}

function renderHeader(route = '/root-1/goals') {
    return render(
        <QueryClientProvider client={createQueryClient()}>
            <MemoryRouter initialEntries={[route]}>
                <Routes>
                    <Route
                        path="/:rootId/*"
                        element={(
                            <>
                                <NavigationHeader onOpenSettings={vi.fn()} onHeightChange={vi.fn()} />
                                <LocationProbe />
                            </>
                        )}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('NavigationHeader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsMobile.mockReturnValue(false);
        mockActiveSession.current = null;
        mockActiveSession.byRoot = null;
        mockUser.current = { id: 'user-1', is_admin: false };
        getAllFractals.mockResolvedValue({
            data: [
                {
                    id: 'root-1',
                    name: 'First Root',
                    type: 'UltimateGoal',
                    is_smart: false,
                    display_level: { color: '#111111', secondary_color: '#222222', icon: 'circle' },
                },
                {
                    id: 'root-2',
                    name: 'Second Root',
                    type: 'LongTermGoal',
                    is_smart: true,
                    display_level: { color: '#333333', secondary_color: '#444444', icon: 'hexagon' },
                },
            ],
        });
    });

    it('opens a fractal dropdown from the root icon and name', async () => {
        renderHeader('/root-1/goals');

        const trigger = screen.getByRole('button', { name: /switch fractal.*first root/i });
        trigger.getBoundingClientRect = () => ({ left: 24, bottom: 52 });
        fireEvent.click(trigger);

        expect(await screen.findByRole('menu', { name: /available fractals/i })).toBeInTheDocument();
        expect(await screen.findByRole('menuitem', { name: /second root/i })).toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: /first root/i })).not.toBeInTheDocument();
        expect(screen.queryByText('Current')).not.toBeInTheDocument();
        const menu = screen.getByRole('menu', { name: /available fractals/i });
        expect(menu.parentElement).toBe(document.body);
        expect(menu).toHaveStyle({ left: '24px', top: '60px' });
    });

    it('keeps the portaled menu open when interacting inside it and closes it outside', async () => {
        renderHeader('/root-1/goals');

        fireEvent.click(screen.getByRole('button', { name: /switch fractal.*first root/i }));
        const menu = await screen.findByRole('menu', { name: /available fractals/i });
        fireEvent.mouseDown(menu);
        expect(menu).toBeInTheDocument();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('menu', { name: /available fractals/i })).not.toBeInTheDocument();
    });

    it('switches roots from the dropdown while preserving the current nav section', async () => {
        renderHeader('/root-1/programs');

        fireEvent.click(screen.getByRole('button', { name: /switch fractal.*first root/i }));
        fireEvent.click(await screen.findByRole('menuitem', { name: /second root/i }));

        await waitFor(() => {
            expect(screen.getByTestId('location-path')).toHaveTextContent('/root-2/programs');
        });
    });

    it('hides the logs nav link from non-admin users', () => {
        renderHeader('/root-1/goals');

        expect(screen.queryByRole('link', { name: 'LOGS' })).not.toBeInTheDocument();
    });

    it('shows the logs nav link to admin users', () => {
        mockUser.current = { id: 'admin-1', is_admin: true };

        renderHeader('/root-1/goals');

        expect(screen.getByRole('link', { name: 'LOGS' })).toHaveAttribute('href', '/root-1/logs');
    });

    it('renders mobile primary navigation inside the sticky header with active-route semantics', () => {
        mockIsMobile.mockReturnValue(true);

        renderHeader('/root-1/programs');

        const primaryNav = screen.getByRole('navigation', { name: 'Primary' });
        const switcher = screen.getByRole('button', { name: /switch fractal.*first root/i });
        const settings = screen.getByRole('button', { name: 'SETTINGS' });
        const exit = screen.getByRole('link', { name: 'EXIT' });
        expect(primaryNav.closest('.top-nav-links')).not.toBeNull();
        expect(primaryNav.className).toContain('mobilePrimaryNav');
        expect(primaryNav.parentElement).toContainElement(switcher);
        expect(primaryNav.parentElement).toContainElement(screen.getByRole('link', { name: '+ ADD SESSION' }));
        expect(switcher).toContainElement(screen.getByTestId('goal-icon'));
        expect(switcher).not.toHaveTextContent('First Root');
        expect(settings).toBeVisible();
        expect(primaryNav.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(settings.compareDocumentPosition(exit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(exit).toHaveAttribute('href', '/');
        expect(screen.getByRole('link', { name: 'PROGRAMS' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: 'GOALS' })).not.toHaveAttribute('aria-current');
        expect(screen.getAllByRole('link').filter(link => ['GOALS', 'PROGRAMS', 'SESSIONS', 'NOTES', 'ANALYTICS'].includes(link.textContent))).toHaveLength(5);
    });

    it('links a running session across fractals from the desktop nav', () => {
        mockActiveSession.current = {
            id: 'session-9',
            root_id: 'root-2',
            is_paused: false,
        };

        renderHeader('/root-1/goals');

        const link = screen.getByRole('link', { name: /session in progress/i });
        expect(link).toHaveAttribute('href', '/root-2/session/session-9');
        expect(link).toHaveTextContent('SESSION IN PROGRESS');
        const status = link.querySelector('[aria-label="Session in progress"]');
        expect(status).not.toBeNull();
        expect(link.lastElementChild).toBe(status);
    });

    it('uses the shared paused badge and label in the mobile nav', () => {
        mockIsMobile.mockReturnValue(true);
        mockActiveSession.current = {
            id: 'session-8',
            root_id: 'root-1',
            is_paused: true,
        };

        renderHeader('/root-1/goals');

        const link = screen.getByRole('link', { name: /session paused/i });
        expect(link).toHaveAttribute('href', '/root-1/session/session-8');
        expect(link).toHaveTextContent('SESSION PAUSED');
        expect(link.querySelector('[aria-label="Paused session"]')).not.toBeNull();
    });

    it('rechecks active-session state when switching fractals', async () => {
        mockActiveSession.byRoot = {
            'root-1': { id: 'session-1', root_id: 'root-1', is_paused: false },
            'root-2': null,
        };
        renderHeader('/root-1/goals');
        expect(screen.getByRole('link', { name: /session in progress/i })).toHaveAttribute(
            'href',
            '/root-1/session/session-1',
        );

        fireEvent.click(screen.getByRole('button', { name: /switch fractal.*first root/i }));
        fireEvent.click(await screen.findByRole('menuitem', { name: /second root/i }));

        await waitFor(() => {
            expect(screen.getByRole('link', { name: '+ ADD SESSION' })).toHaveAttribute(
                'href',
                '/root-2/create-session',
            );
        });
    });
});
