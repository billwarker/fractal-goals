import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import Admin from '../Admin';

const {
    getSummary,
    getUsers,
    getTierQuotas,
    getInviteKeys,
    createInviteKey,
    createUser,
    updateTierQuotas,
    getFeatureFlags,
    updateFeatureFlags,
    updateUser,
    softDeleteUser,
    hardDeleteUser,
    generateTemporaryPassword,
    updateUserTier,
    updateUserQuota,
    updateUserStatus,
    unlockUser,
    forcePasswordChange,
    updateUserRole,
    getLandingExamples,
    updateLandingExamples,
    publishLandingExamples,
    getBetaSignups,
    updateBetaSignupStatus,
} = vi.hoisted(() => ({
    getSummary: vi.fn(),
    getUsers: vi.fn(),
    getTierQuotas: vi.fn(),
    getInviteKeys: vi.fn(),
    createInviteKey: vi.fn(),
    createUser: vi.fn(),
    updateTierQuotas: vi.fn(),
    getFeatureFlags: vi.fn(),
    updateFeatureFlags: vi.fn(),
    updateUser: vi.fn(),
    softDeleteUser: vi.fn(),
    hardDeleteUser: vi.fn(),
    generateTemporaryPassword: vi.fn(),
    updateUserTier: vi.fn(),
    updateUserQuota: vi.fn(),
    updateUserStatus: vi.fn(),
    unlockUser: vi.fn(),
    forcePasswordChange: vi.fn(),
    updateUserRole: vi.fn(),
    getLandingExamples: vi.fn(),
    updateLandingExamples: vi.fn(),
    publishLandingExamples: vi.fn(),
    getBetaSignups: vi.fn(),
    updateBetaSignupStatus: vi.fn(),
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
        getTierQuotas: (...args) => getTierQuotas(...args),
        getInviteKeys: (...args) => getInviteKeys(...args),
        createInviteKey: (...args) => createInviteKey(...args),
        createUser: (...args) => createUser(...args),
        updateTierQuotas: (...args) => updateTierQuotas(...args),
        getFeatureFlags: (...args) => getFeatureFlags(...args),
        updateFeatureFlags: (...args) => updateFeatureFlags(...args),
        updateUser: (...args) => updateUser(...args),
        softDeleteUser: (...args) => softDeleteUser(...args),
        hardDeleteUser: (...args) => hardDeleteUser(...args),
        generateTemporaryPassword: (...args) => generateTemporaryPassword(...args),
        updateUserTier: (...args) => updateUserTier(...args),
        updateUserQuota: (...args) => updateUserQuota(...args),
        updateUserStatus: (...args) => updateUserStatus(...args),
        unlockUser: (...args) => unlockUser(...args),
        forcePasswordChange: (...args) => forcePasswordChange(...args),
        updateUserRole: (...args) => updateUserRole(...args),
        getLandingExamples: (...args) => getLandingExamples(...args),
        updateLandingExamples: (...args) => updateLandingExamples(...args),
        publishLandingExamples: (...args) => publishLandingExamples(...args),
        getBetaSignups: (...args) => getBetaSignups(...args),
        updateBetaSignupStatus: (...args) => updateBetaSignupStatus(...args),
        exportBetaSignupsCsv: vi.fn(),
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
                    quota_overrides: {},
                    tier_default_limits: {
                        free: {
                            fractals: 1,
                            goals: 77,
                            sessions: 200,
                            activity_instances: 500,
                            activities: 50,
                            metrics: 20,
                            session_templates: 10,
                            notes: 1000,
                            programs: 5,
                        },
                        paid: {
                            fractals: 10,
                            goals: 1000,
                            sessions: 5000,
                            activity_instances: 20000,
                            activities: 500,
                            metrics: 250,
                            session_templates: 250,
                            notes: 10000,
                            programs: 50,
                        },
                        legacy: null,
                    },
                    failed_login_count: 2,
                    locked_until: null,
                    force_password_change: false,
                    resources: ['fractals', 'goals', 'sessions', 'activity_instances', 'activities', 'metrics', 'session_templates', 'notes', 'programs'],
                    labels: { activity_instances: 'activity instances', session_templates: 'session templates' },
                    fractals: [{ id: 'root-1', name: 'Root', created_at: '2026-06-01T00:00:00Z', goal_count: 2, session_count: 3, completed: false }],
                }],
                total: 1,
            },
        });
        getTierQuotas.mockResolvedValue({
            data: {
                tier_default_limits: {
                    free: {
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
                    paid: {
                        fractals: 10,
                        goals: 1000,
                        sessions: 5000,
                        activity_instances: 20000,
                        activities: 500,
                        metrics: 250,
                        session_templates: 250,
                        notes: 10000,
                        programs: 50,
                    },
                    legacy: null,
                },
                tier_storage_limit_bytes: {
                    free: 104857600,
                    paid: 104857600,
                    legacy: null,
                },
                editable_tiers: ['free', 'paid'],
                unlimited_tiers: ['legacy'],
                resources: ['fractals', 'goals', 'sessions', 'activity_instances', 'activities', 'metrics', 'session_templates', 'notes', 'programs'],
                labels: {},
            },
        });
        getInviteKeys.mockResolvedValue({ data: [] });
        createInviteKey.mockResolvedValue({ data: { id: 'key-1', key: 'fg_invite_secret', status: 'available' } });
        createUser.mockResolvedValue({ data: { temporary_password: 'A1createdPassword' } });
        updateTierQuotas.mockResolvedValue({ data: {} });
        getFeatureFlags.mockResolvedValue({
            data: {
                flags: {
                    goal_surface_configuration: false,
                    analytics_sql_explorer: true,
                },
                definitions: [
                    {
                        key: 'goal_surface_configuration',
                        label: 'Goal view configuration',
                        description: 'Shows the configurable goal surface, layout picker, configure controls, and surface widgets.',
                        enabled: false,
                    },
                    {
                        key: 'analytics_sql_explorer',
                        label: 'Analytics SQL explorer',
                        description: 'Shows the analytics query console, SQL chart query inspector, and SQL authoring affordances.',
                        enabled: true,
                    },
                ],
            },
        });
        updateFeatureFlags.mockResolvedValue({
            data: {
                flags: {
                    goal_surface_configuration: true,
                    analytics_sql_explorer: true,
                },
                definitions: [
                    {
                        key: 'goal_surface_configuration',
                        label: 'Goal view configuration',
                        description: 'Shows the configurable goal surface, layout picker, configure controls, and surface widgets.',
                        enabled: true,
                    },
                    {
                        key: 'analytics_sql_explorer',
                        label: 'Analytics SQL explorer',
                        description: 'Shows the analytics query console, SQL chart query inspector, and SQL authoring affordances.',
                        enabled: true,
                    },
                ],
            },
        });
        updateUser.mockResolvedValue({ data: {} });
        softDeleteUser.mockResolvedValue({ data: { message: 'User soft deleted' } });
        hardDeleteUser.mockResolvedValue({ data: { message: 'User hard deleted' } });
        generateTemporaryPassword.mockResolvedValue({ data: { temporary_password: 'A1temporaryPassword' } });
        updateUserTier.mockResolvedValue({ data: {} });
        updateUserQuota.mockResolvedValue({ data: {} });
        updateUserStatus.mockResolvedValue({ data: {} });
        unlockUser.mockResolvedValue({ data: {} });
        forcePasswordChange.mockResolvedValue({ data: {} });
        updateUserRole.mockResolvedValue({ data: {} });
        getLandingExamples.mockResolvedValue({
            data: {
                eligible_fractals: [
                    {
                        root_id: 'root-1',
                        name: 'Guitar practice tracker',
                        updated_at: '2026-06-09T12:00:00Z',
                        goal_count: 8,
                    },
                    {
                        root_id: 'root-2',
                        name: 'Chinese language tracker',
                        updated_at: '2026-06-08T12:00:00Z',
                        goal_count: 12,
                    },
                ],
                examples: [
                    { root_id: 'root-1', label: 'Guitar practice', sort_order: 0 },
                ],
                published_at: '2026-06-09T12:00:00Z',
                published_example_count: 1,
            },
        });
        updateLandingExamples.mockResolvedValue({
            data: {
                eligible_fractals: [],
                examples: [
                    { root_id: 'root-1', label: 'Guitar practice refined', sort_order: 0 },
                    { root_id: 'root-2', label: 'Chinese language tracker', sort_order: 1 },
                ],
                published_at: '2026-06-09T12:00:00Z',
                published_example_count: 1,
            },
        });
        publishLandingExamples.mockResolvedValue({
            data: {
                published_at: '2026-06-09T13:00:00Z',
                published_example_count: 2,
            },
        });
        getBetaSignups.mockResolvedValue({
            data: {
                requests: [
                    {
                        id: 'signup-1',
                        email: 'tester@example.com',
                        use_case: 'Learn jazz guitar',
                        status: 'new',
                        source: 'landing_page',
                        created_at: '2026-06-10T00:00:00Z',
                    },
                ],
                total: 1,
                status_counts: { new: 1, invited: 0, dismissed: 0, total: 1 },
            },
        });
        updateBetaSignupStatus.mockResolvedValue({ data: { request: { id: 'signup-1', status: 'invited' } } });
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

        fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'newbie' } });
        fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'newbie@example.com' } });
        expect(screen.getByPlaceholderText('Tier default')).toHaveValue(null);
        fireEvent.click(screen.getByText('Add User'));
        await waitFor(() => expect(createUser).toHaveBeenCalledWith({
            username: 'newbie',
            email: 'newbie@example.com',
        }));

        fireEvent.click(screen.getByText('invite keys'));
        fireEvent.change(screen.getByPlaceholderText('Label'), { target: { value: 'Wave 1' } });
        fireEvent.click(screen.getByText('Generate'));

        await waitFor(() => expect(screen.getByText('fg_invite_secret')).toBeInTheDocument());
    });

    it('opens user actions and runs core account actions', async () => {
        renderAdmin();

        fireEvent.click(screen.getByText('users'));
        await waitFor(() => expect(screen.getByText('tester')).toBeInTheDocument());

        expect(screen.queryByText('Delete User')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Actions' }));

        expect(screen.getByText('Actions for tester')).toBeInTheDocument();
        expect(screen.getByText('Upgrade Tier')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Quota' }));
        expect(screen.getByText('Upgrade Quotas')).toBeInTheDocument();
        expect(screen.getByDisplayValue(/"goals": 50/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Password' }));
        expect(screen.getByText('Generate Temporary Password')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Access' }));
        expect(screen.getByText('Suspend Account')).toBeInTheDocument();
        expect(screen.getByText('Unlock Account')).toBeInTheDocument();
        expect(screen.getByText('Force Password Change')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Account' }));
        fireEvent.click(screen.getByText('Upgrade Tier'));
        await waitFor(() => expect(updateUserTier).toHaveBeenCalledWith('user-1', { membership_tier: 'free' }));

        fireEvent.click(screen.getByRole('button', { name: 'Quota' }));
        fireEvent.click(screen.getByText('Upgrade Quotas'));
        await waitFor(() => expect(updateUserQuota).toHaveBeenCalledWith('user-1', {
            quota_overrides: {
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
            storage_limit_bytes: 104857600,
        }));
        fireEvent.click(screen.getByText('Reset to Tier Defaults'));
        await waitFor(() => expect(updateUserQuota).toHaveBeenCalledWith('user-1', {
            quota_overrides: {},
            storage_limit_bytes: 104857600,
        }));
        expect(screen.getByDisplayValue(/"goals": 77/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Access' }));
        fireEvent.click(screen.getByText('Suspend Account'));
        await waitFor(() => expect(updateUserStatus).toHaveBeenCalledWith('user-1', { is_active: false }));

        fireEvent.click(screen.getByText('Unlock Account'));
        await waitFor(() => expect(unlockUser).toHaveBeenCalledWith('user-1'));

        fireEvent.click(screen.getByText('Force Password Change'));
        await waitFor(() => expect(forcePasswordChange).toHaveBeenCalledWith('user-1', { force_password_change: true }));

        fireEvent.click(screen.getByRole('button', { name: 'Account' }));
        fireEvent.click(screen.getByText('Update Role'));
        await waitFor(() => expect(updateUserRole).toHaveBeenCalledWith('user-1', { role: 'user' }));

        fireEvent.click(screen.getByRole('button', { name: 'Password' }));
        fireEvent.click(screen.getByText('Generate Temporary Password'));
        await waitFor(() => expect(generateTemporaryPassword).toHaveBeenCalledWith('user-1'));
        expect(screen.getByText(/A1temporaryPassword/)).toBeInTheDocument();
    });

    it('requires typed confirmations for soft and hard delete actions', async () => {
        renderAdmin();

        fireEvent.click(screen.getByText('users'));
        await waitFor(() => expect(screen.getByText('tester')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
        fireEvent.click(screen.getByRole('button', { name: 'Destructive' }));

        const softButton = screen.getByRole('button', { name: 'Soft Delete User' });
        const hardButton = screen.getByRole('button', { name: 'Hard Delete User' });
        expect(softButton).toBeDisabled();
        expect(hardButton).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText('soft delete'), { target: { value: 'soft delete' } });
        fireEvent.click(softButton);
        await waitFor(() => expect(softDeleteUser).toHaveBeenCalledWith('user-1'));

        fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
        fireEvent.click(screen.getByRole('button', { name: 'Destructive' }));
        fireEvent.change(screen.getByPlaceholderText('hard delete tester'), { target: { value: 'hard delete tester' } });
        fireEvent.click(screen.getByRole('button', { name: 'Hard Delete User' }));

        await waitFor(() => expect(hardDeleteUser).toHaveBeenCalledWith('user-1'));
    });

    it('manages tier quota defaults with new-user or existing-user scope', async () => {
        renderAdmin();

        fireEvent.click(screen.getByText('tier quotas'));
        await waitFor(() => expect(screen.getByDisplayValue(/"goals": 50/)).toBeInTheDocument());
        const storageInput = screen.getByLabelText('Default Storage MB');
        expect(storageInput).toHaveValue(100);
        fireEvent.change(storageInput, { target: { value: '250' } });

        fireEvent.click(screen.getByText('Save Tier Quotas'));
        await waitFor(() => expect(updateTierQuotas).toHaveBeenCalledWith({
            tier: 'free',
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
            storage_limit_bytes: 262144000,
            apply_existing_users: false,
        }));

        fireEvent.click(screen.getByLabelText('Apply to existing users in this tier'));
        fireEvent.click(screen.getByText('Save Tier Quotas'));
        await waitFor(() => expect(updateTierQuotas).toHaveBeenLastCalledWith({
            tier: 'free',
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
            storage_limit_bytes: 262144000,
            apply_existing_users: true,
        }));
    });

    it('manages feature flags', async () => {
        renderAdmin();

        fireEvent.click(screen.getByText('feature flags'));
        await waitFor(() => expect(screen.getByText('Goal view configuration')).toBeInTheDocument());

        expect(screen.getByText('Analytics SQL explorer')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Goal view configuration'));

        await waitFor(() => expect(updateFeatureFlags).toHaveBeenCalledWith({
            flags: { goal_surface_configuration: true },
        }));
    });

    it('manages landing example draft selection and publish', async () => {
        renderAdmin();

        fireEvent.click(screen.getByText('landing'));
        await waitFor(() => expect(screen.getByText('Landing Examples')).toBeInTheDocument());

        expect(screen.getByRole('link', { name: 'View landing page' })).toHaveAttribute('href', '/landing-preview');
        expect(screen.getAllByText('Guitar practice tracker').length).toBeGreaterThan(0);
        expect(screen.getByDisplayValue('Guitar practice')).toBeInTheDocument();
        expect(screen.getByText('Chinese language tracker')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        fireEvent.change(screen.getByDisplayValue('Guitar practice'), {
            target: { value: 'Guitar practice refined' },
        });
        fireEvent.click(screen.getByText('Save Draft'));

        const emptyShowcase = {
            session_id: null,
            activity_ids: [],
            program_id: null,
            program_start_date: null,
            program_end_date: null,
            analytics_view_ids: [],
        };
        await waitFor(() => expect(updateLandingExamples).toHaveBeenCalledWith({
            examples: [
                { root_id: 'root-1', label: 'Guitar practice refined', sort_order: 0, showcase: emptyShowcase },
                { root_id: 'root-2', label: 'Chinese language tracker', sort_order: 1, showcase: emptyShowcase },
            ],
        }));

        fireEvent.click(screen.getByText('Publish'));
        await waitFor(() => expect(publishLandingExamples).toHaveBeenCalledWith({
            examples: [
                { root_id: 'root-1', label: 'Guitar practice refined', sort_order: 0, showcase: emptyShowcase },
                { root_id: 'root-2', label: 'Chinese language tracker', sort_order: 1, showcase: emptyShowcase },
            ],
        }));
    });

    it('lists beta signups and updates their status', async () => {
        renderAdmin();

        fireEvent.click(screen.getByText('beta signups'));

        await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument());
        expect(screen.getByText('Learn jazz guitar')).toBeInTheDocument();
        expect(getBetaSignups).toHaveBeenCalled();

        const statusSelect = screen.getByDisplayValue('new');
        fireEvent.change(statusSelect, { target: { value: 'invited' } });
        await waitFor(() => expect(updateBetaSignupStatus).toHaveBeenCalledWith('signup-1', { status: 'invited' }));
    });
});
