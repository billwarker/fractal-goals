import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import Selection from '../Selection';
import { queryKeys } from '../../hooks/queryKeys';

const {
    mockNavigate,
    mockLogout,
    getAllFractals,
    getGoalLevels,
    createFractal,
    deleteFractal,
    notify,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockLogout: vi.fn(),
    getAllFractals: vi.fn(),
    getGoalLevels: vi.fn(),
    createFractal: vi.fn(),
    deleteFractal: vi.fn(),
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

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
    default: function GoalModal({ isOpen, onSubmit }) {
        if (!isOpen) {
            return null;
        }

        return (
            <button onClick={() => onSubmit({ name: 'New Fractal', type: 'UltimateGoal' })}>
                Submit fractal
            </button>
        );
    },
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

vi.mock('../../utils/notify', () => ({
    default: notify,
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

    it('uses notify instead of alert when fractal creation fails', async () => {
        const queryClient = createQueryClient();
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

        getAllFractals.mockResolvedValueOnce({ data: [] });
        createFractal.mockRejectedValueOnce(new Error('Create failed'));

        renderSelection(queryClient);

        await waitFor(() => {
            expect(screen.getByText('New Fractal')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('New Fractal'));
        fireEvent.click(screen.getByText('Submit fractal'));

        await waitFor(() => {
            expect(notify.error).toHaveBeenCalledWith('Failed to create fractal: Create failed');
        });
        expect(alertSpy).not.toHaveBeenCalled();

        alertSpy.mockRestore();
    });

    it('uses notify instead of alert when fractal deletion fails', async () => {
        const queryClient = createQueryClient();
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

        getAllFractals.mockResolvedValueOnce({
            data: [
                { id: 'root-1', name: 'Root 1', type: 'UltimateGoal', is_smart: false, created_at: '2026-03-01T00:00:00Z' },
            ],
        });
        getGoalLevels.mockResolvedValueOnce({
            data: [{ name: 'Ultimate Goal', color: '#111111', secondary_color: '#222222', icon: 'circle' }],
        });
        deleteFractal.mockRejectedValueOnce(new Error('Delete failed'));

        renderSelection(queryClient);

        await waitFor(() => {
            expect(screen.getByText('Root 1')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTitle('Delete Fractal'));
        fireEvent.click(screen.getByText('Confirm delete'));

        await waitFor(() => {
            expect(notify.error).toHaveBeenCalledWith('Failed to delete fractal: Delete failed');
        });
        expect(alertSpy).not.toHaveBeenCalled();

        alertSpy.mockRestore();
    });
});
