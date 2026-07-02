import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { NavigationHeader } from '../AppRouter';

const {
    getAllFractals,
    mockIsMobile,
    mockRootGoal,
} = vi.hoisted(() => ({
    getAllFractals: vi.fn(),
    mockIsMobile: vi.fn(() => false),
    mockRootGoal: {
        id: 'root-1',
        name: 'First Root',
        type: 'UltimateGoal',
        is_smart: false,
    },
}));

vi.mock('../utils/api', () => ({
    globalApi: {
        getAllFractals: (...args) => getAllFractals(...args),
    },
}));

vi.mock('../hooks/useGoalQueries', () => ({
    useRootGoal: () => ({ data: mockRootGoal }),
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'user-1' },
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

        fireEvent.click(screen.getByRole('button', { name: /switch fractal.*first root/i }));

        expect(await screen.findByRole('menu', { name: /available fractals/i })).toBeInTheDocument();
        expect(await screen.findByRole('menuitem', { name: /second root/i })).toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: /first root/i })).not.toBeInTheDocument();
        expect(screen.queryByText('Current')).not.toBeInTheDocument();
    });

    it('switches roots from the dropdown while preserving the current nav section', async () => {
        renderHeader('/root-1/programs');

        fireEvent.click(screen.getByRole('button', { name: /switch fractal.*first root/i }));
        fireEvent.click(await screen.findByRole('menuitem', { name: /second root/i }));

        await waitFor(() => {
            expect(screen.getByTestId('location-path')).toHaveTextContent('/root-2/programs');
        });
    });
});
