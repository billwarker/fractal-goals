import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Admin from '../Admin';
import notify from '../../utils/notify';
const {
    getSummary,
    getUsage,
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
    getLandingExampleOptions,
    updateLandingExamples,
    publishLandingExamples,
    getBetaSignups,
    updateBetaSignupStatus,
    sendBetaSignupInvite,
} = vi.hoisted(() => ({
    getSummary: vi.fn(),
    getUsage: vi.fn(),
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
    getLandingExampleOptions: vi.fn(),
    updateLandingExamples: vi.fn(),
    publishLandingExamples: vi.fn(),
    getBetaSignups: vi.fn(),
    updateBetaSignupStatus: vi.fn(),
    sendBetaSignupInvite: vi.fn(),
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
        getUsage: (...args) => getUsage(...args),
        pruneUsage: vi.fn(),
        updateUsageRetention: vi.fn(),
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
        getLandingExampleOptions: (...args) => getLandingExampleOptions(...args),
        updateLandingExamples: (...args) => updateLandingExamples(...args),
        publishLandingExamples: (...args) => publishLandingExamples(...args),
        getBetaSignups: (...args) => getBetaSignups(...args),
        updateBetaSignupStatus: (...args) => updateBetaSignupStatus(...args),
        sendBetaSignupInvite: (...args) => sendBetaSignupInvite(...args),
        exportBetaSignupsCsv: vi.fn(),
        revokeInviteKey: vi.fn(),
    },
}));
vi.mock('../../utils/notify', () => ({
    default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('react-chartjs-2', () => ({
    Bar: () => <div data-testid="dau-bar-chart" />,
}));
vi.mock('../../components/analytics/ChartJSWrapper', () => ({
    DISABLED_CHART_ANIMATION: { animation: false },
    useChartThemeDefaults: () => ({
        gridColor: '#333',
        textColor: '#ccc',
        primaryColor: '#4f9cf9',
        secondaryColor: '#22c55e',
        tooltipBg: '#111',
    }),
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
        getUsage.mockResolvedValue({
            data: {
                window: { start: '2026-06-08', end: '2026-07-07', days: 30 },
                window_days: 30,
                active_users: { dau: [{ date: '2026-07-07', count: 1 }], wau: 1, mau: 1 },
                signups_by_day: [],
                per_user: [],
                events_breakdown: [],
                top_events: [],
                top_pages: [],
                email_health: [],
                storage: { tables: [] },
                retention: { product_events_days: 180 },
                export: { last_run_at: null, last_run_status: null, tables: {} },
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
        getLandingExampleOptions.mockResolvedValue({
            data: {
                root_id: 'root-1',
                goals: [
                    { id: 'goal-1', name: 'Build a repertoire', level_name: 'Long Term Goal', targets: [] },
                    { id: 'goal-2', name: 'Play CAGED triads', level_name: 'Short Term Goal', targets: [] },
                    {
                        id: 'goal-3',
                        name: 'Improve triad speed',
                        level_name: 'Immediate Goal',
                        targets: [{ id: 'target-1', name: '120 BPM clean changes' }],
                    },
                ],
                sessions: [],
                activities: [],
                programs: [],
                analytics_views: [],
            },
        });
        updateLandingExamples.mockImplementation(({ examples }) => Promise.resolve({
            data: {
                eligible_fractals: [
                    { root_id: 'root-1', name: 'Guitar practice tracker', updated_at: '2026-06-09T12:00:00Z' },
                    { root_id: 'root-2', name: 'Chinese language tracker', updated_at: '2026-06-08T12:00:00Z' },
                ],
                examples,
                published_at: '2026-06-09T12:00:00Z',
                published_example_count: 1,
            },
        }));
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
                        last_invite_email_sent_at: null,
                    },
                ],
                total: 1,
                status_counts: { new: 1, invited: 0, dismissed: 0, total: 1 },
            },
        });
        updateBetaSignupStatus.mockResolvedValue({ data: { request: { id: 'signup-1', status: 'invited' } } });
        sendBetaSignupInvite.mockResolvedValue({ data: { request: { id: 'signup-1', status: 'invited' } } });
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
        fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'invitee@example.com' } });
        fireEvent.change(screen.getByPlaceholderText('Label'), { target: { value: 'Wave 1' } });
        fireEvent.click(screen.getByText('Generate'));
        await waitFor(() => expect(createInviteKey).toHaveBeenCalledWith({
            email: 'invitee@example.com',
            label: 'Wave 1',
        }));
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
        expect(screen.getByText('Account status')).toBeInTheDocument();
        expect(screen.getByText('Login lock')).toBeInTheDocument();
        expect(screen.getByText('Not locked')).toBeInTheDocument();
        expect(screen.getByText('Clear Login Lock')).toBeInTheDocument();
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
        updateUserStatus.mockResolvedValueOnce({
            data: {
                id: 'user-1',
                username: 'tester',
                email: 'tester@example.com',
                role: 'user',
                is_active: false,
                membership_tier: 'free',
                failed_login_count: 2,
                locked_until: null,
                force_password_change: false,
                quota_overrides: {},
                tier_default_limits: {},
                storage: {},
                limits: {},
                usage: {},
                resources: [],
                labels: {},
                fractals: [],
            },
        });
        fireEvent.click(screen.getByText('Suspend Account'));
        await waitFor(() => expect(updateUserStatus).toHaveBeenCalledWith('user-1', { is_active: false }));
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('User account suspended. They cannot log in.'));
        expect(screen.getByText('Admin access state: this account is suspended and cannot sign in.')).toBeInTheDocument();
        expect(screen.getByText('Reactivate Account')).toBeInTheDocument();
        updateUserStatus.mockResolvedValueOnce({
            data: {
                id: 'user-1',
                username: 'tester',
                email: 'tester@example.com',
                role: 'user',
                is_active: true,
                membership_tier: 'free',
                failed_login_count: 2,
                locked_until: null,
                force_password_change: false,
                quota_overrides: {},
                tier_default_limits: {},
                storage: {},
                limits: {},
                usage: {},
                resources: [],
                labels: {},
                fractals: [],
            },
        });
        fireEvent.click(screen.getByText('Reactivate Account'));
        await waitFor(() => expect(updateUserStatus).toHaveBeenCalledWith('user-1', { is_active: true }));
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('User account reactivated. They can log in again.'));
        expect(screen.getByText('Admin access state: this account is allowed to sign in.')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Clear Login Lock'));
        await waitFor(() => expect(unlockUser).toHaveBeenCalledWith('user-1'));
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Login lock cleared'));
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
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Landing page content/ })).toHaveTextContent('4 issues blocking publish');
        fireEvent.click(screen.getByRole('button', { name: /Landing page content/ }));
        await waitFor(() => expect(getLandingExampleOptions).toHaveBeenCalledWith('root-1'));
        expect((await screen.findAllByRole('tab')).map((tab) => tab.textContent))
            .toEqual(['Goals', 'Sessions', 'Activities', 'Programs', 'Analytics']);
        fireEvent.change(screen.getByLabelText('Example goal for Break it down'), {
            target: { value: 'goal-1' },
        });
        fireEvent.change(screen.getByLabelText('Example goal for Connect your work to your goals'), {
            target: { value: 'goal-2' },
        });
        fireEvent.change(screen.getByLabelText('Example goal for Set measurable targets'), {
            target: { value: 'goal-3' },
        });
        fireEvent.change(screen.getByLabelText('Example target for Set measurable targets'), {
            target: { value: 'target-1' },
        });
        expect(screen.getByRole('button', { name: /Landing page content/ })).toHaveTextContent('0 issues blocking publish');
        expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(screen.getByRole('status')).toHaveTextContent(/Chinese language tracker:.*select an example goal/);
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
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
        await waitFor(() => expect(updateLandingExamples).toHaveBeenCalled());
        const savedExamples = updateLandingExamples.mock.calls.at(-1)[0].examples;
        expect(savedExamples).toHaveLength(2);
        expect(savedExamples[0]).toEqual(expect.objectContaining({
            root_id: 'root-1',
            label: 'Guitar practice refined',
            sort_order: 0,
            showcase: emptyShowcase,
        }));
        expect(savedExamples[0].landing_content.goals.bullets.map((bullet) => [bullet.goal_id, bullet.target_id])).toEqual([
            ['goal-1', null],
            ['goal-2', null],
            ['goal-3', 'target-1'],
        ]);
        fireEvent.click(screen.getByRole('button', { name: 'Remove Chinese language tracker' }));
        fireEvent.click(screen.getByText('Publish'));
        await waitFor(() => expect(publishLandingExamples).toHaveBeenCalled());
        const publishedExamples = publishLandingExamples.mock.calls.at(-1)[0].examples;
        expect(publishedExamples).toHaveLength(1);
        expect(publishedExamples[0].landing_content.goals.bullets[2]).toEqual(expect.objectContaining({
            goal_id: 'goal-3',
            target_id: 'target-1',
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
        fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
        await waitFor(() => expect(sendBetaSignupInvite).toHaveBeenCalledWith('signup-1'));
    });
});
