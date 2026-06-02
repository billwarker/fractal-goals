import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import Admin from '../Admin';

const {
    getSummary,
    getUsers,
    getInviteKeys,
    createInviteKey,
    updateUser,
    deleteUser,
} = vi.hoisted(() => ({
    getSummary: vi.fn(),
    getUsers: vi.fn(),
    getInviteKeys: vi.fn(),
    createInviteKey: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'admin-1', username: 'admin', is_admin: true },
        loading: false,
    }),
}));

vi.mock('../../utils/api', () => ({
    adminApi: {
        getSummary: (...args) => getSummary(...args),
        getUsers: (...args) => getUsers(...args),
        getInviteKeys: (...args) => getInviteKeys(...args),
        createInviteKey: (...args) => createInviteKey(...args),
        updateUser: (...args) => updateUser(...args),
        deleteUser: (...args) => deleteUser(...args),
        revokeInviteKey: vi.fn(),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

function renderAdmin() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <Admin />
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('Admin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getSummary.mockResolvedValue({
            data: {
                total_users: 1,
                active_users: 1,
                total_fractals: 1,
                total_sessions: 3,
                storage_bytes: 2048,
                invite_keys: { available: 2 },
            },
        });
        getUsers.mockResolvedValue({
            data: {
                users: [{
                    id: 'user-1',
                    username: 'tester',
                    email: 'tester@example.com',
                    role: 'user',
                    is_active: true,
                    created_at: '2026-06-01T00:00:00Z',
                    last_login_at: null,
                    membership_tier: 'free',
                    usage: {
                        fractals: 1,
                        goals: 2,
                        sessions: 3,
                        activity_instances: 4,
                        activities: 5,
                        metrics: 6,
                        session_templates: 7,
                        notes: 8,
                        programs: 9,
                    },
                    limits: {
                        fractals: 1,
                        goals: 50,
                        sessions: 200,
                        activity_instances: 500,
                        activities: 50,
                        metrics: 20,
                        session_templates: 10,
                        notes: 1000,
                        programs: 5,
                    },
                    storage: { used_bytes: 1024, limit_bytes: 104857600 },
                    storage_limit_bytes: 104857600,
                    resources: ['fractals', 'goals', 'sessions', 'activity_instances', 'activities', 'metrics', 'session_templates', 'notes', 'programs'],
                    labels: { activity_instances: 'activity instances', session_templates: 'session templates' },
                    fractals: [{ id: 'root-1', name: 'Root', created_at: '2026-06-01T00:00:00Z', goal_count: 2, session_count: 3, completed: false }],
                }],
                total: 1,
            },
        });
        getInviteKeys.mockResolvedValue({ data: [] });
        createInviteKey.mockResolvedValue({ data: { id: 'key-1', key: 'fg_invite_secret', status: 'available' } });
        updateUser.mockResolvedValue({ data: {} });
        deleteUser.mockResolvedValue({ data: { message: 'User deleted' } });
    });

    it('renders user entity metrics, storage, and invite key creation', async () => {
        renderAdmin();

        await waitFor(() => {
            expect(screen.getByText('Admin')).toBeInTheDocument();
            expect(screen.getByText('Users')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('users'));
        await waitFor(() => expect(screen.getByText('tester')).toBeInTheDocument());
        fireEvent.click(screen.getByText('+'));

        expect(screen.getByText('goals')).toBeInTheDocument();
        expect(screen.getByText('activity instances')).toBeInTheDocument();
        expect(screen.getAllByText('Storage').length).toBeGreaterThan(0);
        expect(screen.getByText('Root')).toBeInTheDocument();

        fireEvent.click(screen.getByText('invite keys'));
        fireEvent.change(screen.getByPlaceholderText('Label'), { target: { value: 'Wave 1' } });
        fireEvent.click(screen.getByText('Generate'));

        await waitFor(() => expect(screen.getByText('fg_invite_secret')).toBeInTheDocument());
    });

    it('requires typing delete before deleting a user', async () => {
        renderAdmin();

        fireEvent.click(screen.getByText('users'));
        await waitFor(() => expect(screen.getByText('tester')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Delete User'));
        expect(screen.getByText('Delete User?')).toBeInTheDocument();
        expect(screen.getByText(/Type "delete" to confirm/)).toBeInTheDocument();

        const confirmButton = screen.getAllByRole('button', { name: 'Delete User' })
            .find((button) => button.disabled);
        expect(confirmButton).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText('Type "delete"'), { target: { value: 'delete' } });
        fireEvent.click(confirmButton);

        await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('user-1'));
    });
});
