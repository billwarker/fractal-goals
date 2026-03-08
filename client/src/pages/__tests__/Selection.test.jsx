import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import Selection from '../Selection';
import { queryKeys } from '../../hooks/queryKeys';

const mockNavigate = vi.fn();
const mockLogout = vi.fn();
const getAllFractals = vi.fn();
const getGoalLevels = vi.fn();
const createFractal = vi.fn();
const deleteFractal = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('../../utils/api', () => ({
    globalApi: {
        getAllFractals: (...args) => getAllFractals(...args),
        getGoalLevels: (...args) => getGoalLevels(...args),
        createFractal: (...args) => createFractal(...args),
        deleteFractal: (...args) => deleteFractal(...args),
    },
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: { username: 'will' },
        logout: mockLogout,
        isAuthenticated: true,
        loading: false,
    }),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#123456',
        getGoalTextColor: () => '#ffffff',
        getGoalSecondaryColor: () => '#654321',
        getGoalIcon: () => 'circle',
    }),
}));

vi.mock('../../hooks/useIsMobile', () => ({
    default: () => false,
}));

vi.mock('../../components/modals/GoalModal', () => ({
    default: () => null,
}));

vi.mock('../../components/modals/AuthModal', () => ({
    default: () => null,
}));

vi.mock('../../components/atoms/GoalIcon', () => ({
    default: () => <div data-testid="goal-icon" />,
}));

vi.mock('../../components/modals/DeleteConfirmModal', () => ({
    default: function DeleteConfirmModal({ isOpen, onConfirm, onClose }) {
        if (!isOpen) {
            return null;
        }

        return (
            <div>
                <button onClick={onConfirm}>Confirm delete</button>
                <button onClick={onClose}>Cancel</button>
            </div>
        );
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

function renderSelection(queryClient) {
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <Selection />
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('Selection', () => {
    const storage = new Map();

    const localStorageMock = {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
            storage.set(key, String(value));
        },
        removeItem: (key) => {
            storage.delete(key);
        },
        clear: () => {
            storage.clear();
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(globalThis, 'localStorage', {
            value: localStorageMock,
            configurable: true,
        });
        localStorageMock.clear();
    });

    it('stores fractals and per-root goal levels under shared query keys', async () => {
        const queryClient = createQueryClient();
        localStorage.setItem('fractal_recent_root_id', 'root-1');

        getAllFractals.mockResolvedValueOnce({
            data: [
                { id: 'root-1', name: 'Root 1', type: 'UltimateGoal', is_smart: false, created_at: '2026-03-01T00:00:00Z' },
                { id: 'root-2', name: 'Root 2', type: 'LongTermGoal', is_smart: true, created_at: '2026-03-02T00:00:00Z' },
            ],
        });
        getGoalLevels.mockImplementation(async (rootId) => ({
            data: rootId === 'root-1'
                ? [{ name: 'Ultimate Goal', color: '#111111', secondary_color: '#222222', icon: 'circle' }]
                : [{ name: 'Long Term Goal', color: '#333333', secondary_color: '#444444', icon: 'square' }],
        }));

        renderSelection(queryClient);

        await waitFor(() => {
            expect(screen.getByText('Root 1')).toBeInTheDocument();
            expect(screen.getByText('Root 2')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(queryClient.getQueryData(queryKeys.fractals())).toHaveLength(2);
            expect(queryClient.getQueryData(queryKeys.goalLevels('root-1'))).toEqual([
                { name: 'Ultimate Goal', color: '#111111', secondary_color: '#222222', icon: 'circle' },
            ]);
            expect(queryClient.getQueryData(queryKeys.goalLevels('root-2'))).toEqual([
                { name: 'Long Term Goal', color: '#333333', secondary_color: '#444444', icon: 'square' },
            ]);
        });
    });

    it('removes deleted fractals from the shared cache and clears the recent root', async () => {
        const queryClient = createQueryClient();
        localStorage.setItem('fractal_recent_root_id', 'root-1');

        getAllFractals.mockResolvedValueOnce({
            data: [
                { id: 'root-1', name: 'Root 1', type: 'UltimateGoal', is_smart: false, created_at: '2026-03-01T00:00:00Z' },
            ],
        });
        getGoalLevels.mockResolvedValueOnce({
            data: [{ name: 'Ultimate Goal', color: '#111111', secondary_color: '#222222', icon: 'circle' }],
        });
        deleteFractal.mockResolvedValueOnce({ data: { ok: true } });

        renderSelection(queryClient);

        await waitFor(() => {
            expect(screen.getByText('Root 1')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTitle('Delete Fractal'));
        fireEvent.click(screen.getByText('Confirm delete'));

        await waitFor(() => {
            expect(queryClient.getQueryData(queryKeys.fractals())).toEqual([]);
            expect(screen.queryByText('Root 1')).not.toBeInTheDocument();
        });

        expect(localStorage.getItem('fractal_recent_root_id')).toBeNull();
    });
});
