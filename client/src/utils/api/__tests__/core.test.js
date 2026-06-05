import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axiosPackage from 'axios';
import fs from 'node:fs';
import path from 'node:path';

const repoSrcDir = path.resolve(process.cwd(), 'src');

function listSourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') return [];
            return listSourceFiles(fullPath);
        }
        if (!/\.[jt]sx?$/.test(entry.name)) return [];
        return [fullPath];
    });
}

describe('api core auth refresh behavior', () => {
    beforeEach(() => {
        vi.resetModules();
        document.cookie = 'fractal_csrf_token=csrf-refresh-token; path=/';
    });

    afterEach(() => {
        document.cookie = 'fractal_csrf_token=; Max-Age=0; path=/';
    });

    it('adds an existing CSRF cookie to refresh without fetching a new CSRF token', async () => {
        const { axios, API_BASE } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push(config);
            return {
                data: { token: 'token-a', user: { id: 'user-a' } },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            await axios.post(`${API_BASE}/auth/refresh`, {}, { _skipCsrfFetch: true });
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain('/auth/refresh');
        expect(calls[0].headers?.['X-CSRF-Token']).toBe('csrf-refresh-token');
        expect(calls.some((call) => String(call.url).includes('/auth/csrf'))).toBe(false);
    });

    it('rejects CSRF auth failures without attempting refresh', async () => {
        const { axios, API_BASE } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push(config);
            const error = new Error('Unauthorized');
            error.config = config;
            error.response = { status: 401, data: { error: 'Unauthorized' }, config };
            throw error;
        };

        try {
            await expect(axios.get(`${API_BASE}/auth/csrf`)).rejects.toMatchObject({
                response: { status: 401 },
            });
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain('/auth/csrf');
        expect(calls.some((call) => String(call.url).includes('/auth/refresh'))).toBe(false);
    });

    it('shares one CSRF fetch across concurrent mutating requests', async () => {
        document.cookie = 'fractal_csrf_token=; Max-Age=0; path=/';
        const { axios, API_BASE } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push(config);
            if (String(config.url).includes('/auth/csrf')) {
                document.cookie = 'fractal_csrf_token=shared-token; path=/';
                return {
                    data: {},
                    status: 200,
                    statusText: 'OK',
                    headers: { 'x-csrf-token': 'shared-token' },
                    config,
                };
            }
            return {
                data: { ok: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            await Promise.all([
                axios.post(`${API_BASE}/root/sessions/session/activities`, {}),
                axios.delete(`${API_BASE}/root/sessions/session/activities/instance`),
            ]);
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls.filter((call) => String(call.url).includes('/auth/csrf'))).toHaveLength(1);
        const mutatingCalls = calls.filter((call) => !String(call.url).includes('/auth/csrf'));
        expect(mutatingCalls).toHaveLength(2);
        expect(mutatingCalls.every((call) => call.headers?.['X-CSRF-Token'] === 'shared-token')).toBe(true);
    });

    it('refreshes and retries once after a CSRF 403', async () => {
        document.cookie = 'fractal_csrf_token=stale-token; path=/';
        const { axios, API_BASE } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push({
                url: config.url,
                headers: { ...(config.headers || {}) },
            });
            if (String(config.url).includes('/auth/csrf')) {
                document.cookie = 'fractal_csrf_token=fresh-token; path=/';
                return {
                    data: {},
                    status: 200,
                    statusText: 'OK',
                    headers: { 'x-csrf-token': 'fresh-token' },
                    config,
                };
            }
            if (config.headers?.['X-CSRF-Token'] === 'stale-token') {
                const error = new Error('Forbidden');
                error.config = config;
                error.response = { status: 403, data: { error: 'CSRF token missing or invalid' }, config };
                throw error;
            }
            return {
                data: { ok: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            const response = await axios.post(`${API_BASE}/root/sessions/session/activities`, {});
            expect(response.data).toEqual({ ok: true });
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls.map((call) => call.headers?.['X-CSRF-Token'])).toEqual([
            'stale-token',
            undefined,
            'fresh-token',
        ]);
    });

    it('attaches and retries CSRF headers for create goal requests', async () => {
        document.cookie = 'fractal_csrf_token=stale-goal-token; path=/';
        const { axios, API_BASE } = await import('../core');
        const { fractalApi } = await import('../fractalApi');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push({
                url: config.url,
                headers: { ...(config.headers?.toJSON?.() || config.headers || {}) },
            });
            if (String(config.url).includes('/auth/csrf')) {
                document.cookie = 'fractal_csrf_token=fresh-goal-token; path=/';
                return {
                    data: {},
                    status: 200,
                    statusText: 'OK',
                    headers: { 'x-csrf-token': 'fresh-goal-token' },
                    config,
                };
            }
            if (config.headers?.get?.('X-CSRF-Token') === 'stale-goal-token') {
                const error = new Error('Forbidden');
                error.config = config;
                error.response = { status: 403, data: { error: 'CSRF token missing or invalid' }, config };
                throw error;
            }
            return {
                data: { id: 'goal-1', name: 'Choosey Lover' },
                status: 201,
                statusText: 'Created',
                headers: {},
                config,
            };
        };

        try {
            const response = await fractalApi.createGoal('root-1', { name: 'Choosey Lover' });
            expect(response.data).toEqual({ id: 'goal-1', name: 'Choosey Lover' });
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls.map((call) => call.headers?.['X-CSRF-Token'])).toEqual([
            'stale-goal-token',
            undefined,
            'fresh-goal-token',
        ]);
        expect(calls.filter((call) => String(call.url).includes(`${API_BASE}/root-1/goals`))).toHaveLength(2);
    });

    it('recovers program day saves with CSRF tokens returned in the response body', async () => {
        document.cookie = 'fractal_csrf_token=stale-day-token; path=/';
        const { axios, API_BASE } = await import('../core');
        const { fractalApi } = await import('../fractalApi');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            const token = config.headers?.get?.('X-CSRF-Token') || config.headers?.['X-CSRF-Token'];
            calls.push({
                url: config.url,
                token,
            });
            if (String(config.url).includes('/auth/csrf')) {
                return {
                    data: { csrf_token: 'fresh-day-token' },
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    config,
                };
            }
            if (token === 'stale-day-token') {
                const error = new Error('Forbidden');
                error.config = config;
                error.response = { status: 403, data: { error: 'CSRF token missing or invalid' }, config };
                throw error;
            }
            return {
                data: { id: 'day-1', name: 'Daily Practice' },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            const response = await fractalApi.updateBlockDay(
                'root-1',
                'program-1',
                'block-1',
                'day-1',
                { name: 'Daily Practice' },
            );
            expect(response.data).toEqual({ id: 'day-1', name: 'Daily Practice' });
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls.map((call) => call.token)).toEqual([
            'stale-day-token',
            undefined,
            'fresh-day-token',
        ]);
        expect(calls.filter((call) => String(call.url).includes(`${API_BASE}/root-1/programs/program-1/blocks/block-1/days/day-1`))).toHaveLength(2);
    });

    it('uses AxiosHeaders accessors when mutating CSRF headers', async () => {
        document.cookie = 'fractal_csrf_token=axios-headers-token; path=/';
        const { axios, API_BASE } = await import('../core');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        axios.defaults.adapter = async (config) => {
            calls.push(config);
            return {
                data: { ok: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            await axios.post(
                `${API_BASE}/root-1/goals`,
                { name: 'Goal' },
                { headers: new axiosPackage.AxiosHeaders() },
            );
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls).toHaveLength(1);
        expect(calls[0].headers.get('X-CSRF-Token')).toBe('axios-headers-token');
    });

    it('attaches CSRF headers to every protected mutating API helper', async () => {
        document.cookie = 'fractal_csrf_token=all-mutators-token; path=/';
        const { axios } = await import('../core');
        const { adminApi } = await import('../adminApi');
        const { authApi } = await import('../authApi');
        const { fractalActivitiesApi } = await import('../fractalActivitiesApi');
        const { fractalGoalsApi } = await import('../fractalGoalsApi');
        const { fractalMetaApi } = await import('../fractalMetaApi');
        const { fractalNotesApi } = await import('../fractalNotesApi');
        const { fractalProgramsApi } = await import('../fractalProgramsApi');
        const { fractalSessionsApi } = await import('../fractalSessionsApi');
        const { globalApi } = await import('../globalApi');
        const { legacyApi } = await import('../legacyApi');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        const protectedMutations = [
            ['admin.createUser', () => adminApi.createUser({ email: 'a@example.com' })],
            ['admin.updateUser', () => adminApi.updateUser('user-1', { role: 'admin' })],
            ['admin.updateTierQuotas', () => adminApi.updateTierQuotas({ tier: 'free', limits: { goals: 100 }, apply_existing_users: false })],
            ['admin.softDeleteUser', () => adminApi.softDeleteUser('user-1')],
            ['admin.hardDeleteUser', () => adminApi.hardDeleteUser('user-1')],
            ['admin.generateTemporaryPassword', () => adminApi.generateTemporaryPassword('user-1')],
            ['admin.updateUserTier', () => adminApi.updateUserTier('user-1', { membership_tier: 'paid' })],
            ['admin.updateUserQuota', () => adminApi.updateUserQuota('user-1', { quota_overrides: { goals: 100 } })],
            ['admin.updateUserStatus', () => adminApi.updateUserStatus('user-1', { is_active: false })],
            ['admin.unlockUser', () => adminApi.unlockUser('user-1')],
            ['admin.forcePasswordChange', () => adminApi.forcePasswordChange('user-1', { force_password_change: true })],
            ['admin.updateUserRole', () => adminApi.updateUserRole('user-1', { role: 'admin' })],
            ['admin.createInviteKey', () => adminApi.createInviteKey({ note: 'invite' })],
            ['admin.revokeInviteKey', () => adminApi.revokeInviteKey('invite-1')],
            ['auth.logout', () => authApi.logout()],
            ['auth.updatePreferences', () => authApi.updatePreferences({ theme: 'dark' })],
            ['auth.updatePassword', () => authApi.updatePassword({ current_password: 'old', new_password: 'new' })],
            ['auth.updateEmail', () => authApi.updateEmail({ email: 'new@example.com' })],
            ['auth.updateUsername', () => authApi.updateUsername({ username: 'new-user' })],
            ['auth.deleteAccount', () => authApi.deleteAccount({ password: 'secret' })],
            ['activities.createFractalMetric', () => fractalActivitiesApi.createFractalMetric('root-1', { name: 'Metric' })],
            ['activities.updateFractalMetric', () => fractalActivitiesApi.updateFractalMetric('root-1', 'metric-1', { name: 'Metric' })],
            ['activities.deleteFractalMetric', () => fractalActivitiesApi.deleteFractalMetric('root-1', 'metric-1')],
            ['activities.createActivityGroup', () => fractalActivitiesApi.createActivityGroup('root-1', { name: 'Group' })],
            ['activities.updateActivityGroup', () => fractalActivitiesApi.updateActivityGroup('root-1', 'group-1', { name: 'Group' })],
            ['activities.setActivityGroupGoals', () => fractalActivitiesApi.setActivityGroupGoals('root-1', 'group-1', ['goal-1'])],
            ['activities.reorderActivityGroups', () => fractalActivitiesApi.reorderActivityGroups('root-1', ['group-1'])],
            ['activities.deleteActivityGroup', () => fractalActivitiesApi.deleteActivityGroup('root-1', 'group-1')],
            ['activities.createActivity', () => fractalActivitiesApi.createActivity('root-1', { name: 'Activity' })],
            ['activities.updateActivity', () => fractalActivitiesApi.updateActivity('root-1', 'activity-1', { name: 'Activity' })],
            ['activities.deleteActivity', () => fractalActivitiesApi.deleteActivity('root-1', 'activity-1')],
            ['activities.setActivityGoals', () => fractalActivitiesApi.setActivityGoals('root-1', 'activity-1', ['goal-1'])],
            ['activities.removeActivityGoal', () => fractalActivitiesApi.removeActivityGoal('root-1', 'activity-1', 'goal-1')],
            ['activities.createActivityInstance', () => fractalActivitiesApi.createActivityInstance('root-1', { session_id: 'session-1', activity_definition_id: 'activity-1' })],
            ['activities.startActivityTimer', () => fractalActivitiesApi.startActivityTimer('root-1', 'instance-1', {})],
            ['activities.completeActivityInstance', () => fractalActivitiesApi.completeActivityInstance('root-1', 'instance-1', {})],
            ['activities.updateActivityInstance', () => fractalActivitiesApi.updateActivityInstance('root-1', 'instance-1', { completed: false })],
            ['activities.recomputeAllProgress', () => fractalActivitiesApi.recomputeAllProgress('root-1')],
            ['goals.createGoal', () => fractalGoalsApi.createGoal('root-1', { name: 'Goal' })],
            ['goals.updateGoal', () => fractalGoalsApi.updateGoal('root-1', 'goal-1', { name: 'Goal' })],
            ['goals.deleteGoal', () => fractalGoalsApi.deleteGoal('root-1', 'goal-1')],
            ['goals.toggleGoalCompletion', () => fractalGoalsApi.toggleGoalCompletion('root-1', 'goal-1', true)],
            ['goals.evaluateGoalTargets', () => fractalGoalsApi.evaluateGoalTargets('root-1', 'goal-1', 'session-1')],
            ['goals.linkGoalActivityGroup', () => fractalGoalsApi.linkGoalActivityGroup('root-1', 'goal-1', 'group-1')],
            ['goals.unlinkGoalActivityGroup', () => fractalGoalsApi.unlinkGoalActivityGroup('root-1', 'goal-1', 'group-1')],
            ['goals.setGoalAssociationsBatch', () => fractalGoalsApi.setGoalAssociationsBatch('root-1', 'goal-1', { activity_ids: [], group_ids: [] })],
            ['goals.copyGoal', () => fractalGoalsApi.copyGoal('root-1', 'goal-1')],
            ['goals.pauseGoal', () => fractalGoalsApi.pauseGoal('root-1', 'goal-1', true)],
            ['goals.freezeGoal', () => fractalGoalsApi.freezeGoal('root-1', 'goal-1', true)],
            ['goals.moveGoal', () => fractalGoalsApi.moveGoal('root-1', 'goal-1', 'goal-2')],
            ['goals.convertGoalLevel', () => fractalGoalsApi.convertGoalLevel('root-1', 'goal-1', 'level-1')],
            ['meta.createAnalyticsView', () => fractalMetaApi.createAnalyticsView('root-1', { name: 'Dashboard' })],
            ['meta.updateAnalyticsView', () => fractalMetaApi.updateAnalyticsView('root-1', 'dashboard-1', { name: 'Dashboard' })],
            ['meta.deleteAnalyticsView', () => fractalMetaApi.deleteAnalyticsView('root-1', 'dashboard-1')],
            ['meta.clearLogs', () => fractalMetaApi.clearLogs('root-1')],
            ['notes.createNote', () => fractalNotesApi.createNote('root-1', { content: 'Note' })],
            ['notes.updateNote', () => fractalNotesApi.updateNote('root-1', 'note-1', { content: 'Note' })],
            ['notes.deleteNote', () => fractalNotesApi.deleteNote('root-1', 'note-1')],
            ['notes.pinNote', () => fractalNotesApi.pinNote('root-1', 'note-1')],
            ['notes.unpinNote', () => fractalNotesApi.unpinNote('root-1', 'note-1')],
            ['programs.createProgram', () => fractalProgramsApi.createProgram('root-1', { name: 'Program' })],
            ['programs.updateProgram', () => fractalProgramsApi.updateProgram('root-1', 'program-1', { name: 'Program' })],
            ['programs.deleteProgram', () => fractalProgramsApi.deleteProgram('root-1', 'program-1')],
            ['programs.createBlock', () => fractalProgramsApi.createBlock('root-1', 'program-1', { name: 'Block' })],
            ['programs.updateBlock', () => fractalProgramsApi.updateBlock('root-1', 'program-1', 'block-1', { name: 'Block' })],
            ['programs.deleteBlock', () => fractalProgramsApi.deleteBlock('root-1', 'program-1', 'block-1')],
            ['programs.attachGoalToDay', () => fractalProgramsApi.attachGoalToDay('root-1', 'program-1', 'block-1', 'day-1', { goal_id: 'goal-1' })],
            ['programs.addBlockDay', () => fractalProgramsApi.addBlockDay('root-1', 'program-1', 'block-1', { name: 'Day' })],
            ['programs.updateBlockDay', () => fractalProgramsApi.updateBlockDay('root-1', 'program-1', 'block-1', 'day-1', { name: 'Day' })],
            ['programs.copyBlockDay', () => fractalProgramsApi.copyBlockDay('root-1', 'program-1', 'block-1', 'day-1', {})],
            ['programs.scheduleBlockDay', () => fractalProgramsApi.scheduleBlockDay('root-1', 'program-1', 'block-1', 'day-1', {})],
            ['programs.unscheduleBlockDayOccurrence', () => fractalProgramsApi.unscheduleBlockDayOccurrence('root-1', 'program-1', 'block-1', 'day-1', {})],
            ['programs.attachGoalToBlock', () => fractalProgramsApi.attachGoalToBlock('root-1', 'program-1', 'block-1', { goal_id: 'goal-1' })],
            ['programs.setProgramGoalDeadline', () => fractalProgramsApi.setProgramGoalDeadline('root-1', 'program-1', { goal_id: 'goal-1' })],
            ['programs.deleteBlockDay', () => fractalProgramsApi.deleteBlockDay('root-1', 'program-1', 'block-1', 'day-1')],
            ['sessions.createSession', () => fractalSessionsApi.createSession('root-1', { name: 'Session' })],
            ['sessions.completeQuickSession', () => fractalSessionsApi.completeQuickSession('root-1', { activities: [] })],
            ['sessions.updateSession', () => fractalSessionsApi.updateSession('root-1', 'session-1', { name: 'Session' })],
            ['sessions.deleteSession', () => fractalSessionsApi.deleteSession('root-1', 'session-1')],
            ['sessions.pauseSession', () => fractalSessionsApi.pauseSession('root-1', 'session-1')],
            ['sessions.resumeSession', () => fractalSessionsApi.resumeSession('root-1', 'session-1')],
            ['sessions.addSessionGoal', () => fractalSessionsApi.addSessionGoal('root-1', 'session-1', 'goal-1')],
            ['sessions.addActivityToSession', () => fractalSessionsApi.addActivityToSession('root-1', 'session-1', { activity_definition_id: 'activity-1' })],
            ['sessions.removeActivityFromSession', () => fractalSessionsApi.removeActivityFromSession('root-1', 'session-1', 'instance-1')],
            ['sessions.updateActivityMetrics', () => fractalSessionsApi.updateActivityMetrics('root-1', 'session-1', 'instance-1', { metrics: [] })],
            ['sessions.createSessionTemplate', () => fractalSessionsApi.createSessionTemplate('root-1', { name: 'Template' })],
            ['sessions.createTemplateFromSession', () => fractalSessionsApi.createTemplateFromSession('root-1', 'session-1', { name: 'Template' })],
            ['sessions.updateSessionTemplate', () => fractalSessionsApi.updateSessionTemplate('root-1', 'template-1', { name: 'Template' })],
            ['sessions.deleteSessionTemplate', () => fractalSessionsApi.deleteSessionTemplate('root-1', 'template-1')],
            ['sessions.duplicateSession', () => fractalSessionsApi.duplicateSession('root-1', 'session-1')],
            ['global.createFractal', () => globalApi.createFractal({ name: 'Fractal' })],
            ['global.deleteFractal', () => globalApi.deleteFractal('root-1')],
            ['global.updateGoalLevel', () => globalApi.updateGoalLevel('level-1', { name: 'Level' })],
            ['global.resetGoalLevel', () => globalApi.resetGoalLevel('level-1')],
            ['legacy.createGoal', () => legacyApi.createGoal({ name: 'Legacy Goal' })],
            ['legacy.createSession', () => legacyApi.createSession({ name: 'Legacy Session' })],
        ];

        axios.defaults.adapter = async (config) => {
            calls.push({
                url: config.url,
                method: String(config.method || '').toLowerCase(),
                label: protectedMutations[calls.length]?.[0],
                token: config.headers?.get?.('X-CSRF-Token') || config.headers?.['X-CSRF-Token'],
            });
            return {
                data: { ok: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            for (const [, invoke] of protectedMutations) {
                await invoke();
            }
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls).toHaveLength(protectedMutations.length);
        expect(calls.filter((call) => call.token !== 'all-mutators-token')).toEqual([]);
    });

    it('keeps app-surface mutating helpers on the expected protected endpoints', async () => {
        document.cookie = 'fractal_csrf_token=surface-token; path=/';
        const { axios, API_BASE } = await import('../core');
        const { fractalActivitiesApi } = await import('../fractalActivitiesApi');
        const { fractalGoalsApi } = await import('../fractalGoalsApi');
        const { fractalMetaApi } = await import('../fractalMetaApi');
        const { fractalNotesApi } = await import('../fractalNotesApi');
        const { fractalProgramsApi } = await import('../fractalProgramsApi');
        const { fractalSessionsApi } = await import('../fractalSessionsApi');
        const calls = [];
        const originalAdapter = axios.defaults.adapter;

        const surfaceMutations = [
            ['goals.createGoal', 'post', '/root-1/goals', () => fractalGoalsApi.createGoal('root-1', { name: 'Goal' })],
            ['goals.updateGoal', 'put', '/root-1/goals/goal-1', () => fractalGoalsApi.updateGoal('root-1', 'goal-1', { name: 'Goal' })],
            ['goals.deleteGoal', 'delete', '/root-1/goals/goal-1', () => fractalGoalsApi.deleteGoal('root-1', 'goal-1')],
            ['goals.toggleGoalCompletion', 'patch', '/root-1/goals/goal-1/complete', () => fractalGoalsApi.toggleGoalCompletion('root-1', 'goal-1', true)],
            ['goals.evaluateGoalTargets', 'post', '/root-1/goals/goal-1/evaluate-targets', () => fractalGoalsApi.evaluateGoalTargets('root-1', 'goal-1', 'session-1')],
            ['goals.linkGoalActivityGroup', 'post', '/root-1/goals/goal-1/activity-groups/group-1', () => fractalGoalsApi.linkGoalActivityGroup('root-1', 'goal-1', 'group-1')],
            ['goals.unlinkGoalActivityGroup', 'delete', '/root-1/goals/goal-1/activity-groups/group-1', () => fractalGoalsApi.unlinkGoalActivityGroup('root-1', 'goal-1', 'group-1')],
            ['goals.setGoalAssociationsBatch', 'put', '/root-1/goals/goal-1/associations/batch', () => fractalGoalsApi.setGoalAssociationsBatch('root-1', 'goal-1', { activity_ids: [], group_ids: [] })],
            ['goals.copyGoal', 'post', '/root-1/goals/goal-1/copy', () => fractalGoalsApi.copyGoal('root-1', 'goal-1')],
            ['goals.pauseGoal', 'patch', '/root-1/goals/goal-1/pause', () => fractalGoalsApi.pauseGoal('root-1', 'goal-1', true)],
            ['goals.freezeGoal', 'patch', '/root-1/goals/goal-1/freeze', () => fractalGoalsApi.freezeGoal('root-1', 'goal-1', true)],
            ['goals.moveGoal', 'patch', '/root-1/goals/goal-1/move', () => fractalGoalsApi.moveGoal('root-1', 'goal-1', 'goal-2')],
            ['goals.convertGoalLevel', 'patch', '/root-1/goals/goal-1/convert-level', () => fractalGoalsApi.convertGoalLevel('root-1', 'goal-1', 'level-1')],

            ['programs.createProgram', 'post', '/root-1/programs', () => fractalProgramsApi.createProgram('root-1', { name: 'Program' })],
            ['programs.updateProgram', 'put', '/root-1/programs/program-1', () => fractalProgramsApi.updateProgram('root-1', 'program-1', { name: 'Program' })],
            ['programs.deleteProgram', 'delete', '/root-1/programs/program-1', () => fractalProgramsApi.deleteProgram('root-1', 'program-1')],
            ['programs.createBlock', 'post', '/root-1/programs/program-1/blocks', () => fractalProgramsApi.createBlock('root-1', 'program-1', { name: 'Block' })],
            ['programs.updateBlock', 'put', '/root-1/programs/program-1/blocks/block-1', () => fractalProgramsApi.updateBlock('root-1', 'program-1', 'block-1', { name: 'Block' })],
            ['programs.deleteBlock', 'delete', '/root-1/programs/program-1/blocks/block-1', () => fractalProgramsApi.deleteBlock('root-1', 'program-1', 'block-1')],
            ['programs.addBlockDay', 'post', '/root-1/programs/program-1/blocks/block-1/days', () => fractalProgramsApi.addBlockDay('root-1', 'program-1', 'block-1', { name: 'Day' })],
            ['programs.updateBlockDay', 'put', '/root-1/programs/program-1/blocks/block-1/days/day-1', () => fractalProgramsApi.updateBlockDay('root-1', 'program-1', 'block-1', 'day-1', { name: 'Day' })],
            ['programs.deleteBlockDay', 'delete', '/root-1/programs/program-1/blocks/block-1/days/day-1', () => fractalProgramsApi.deleteBlockDay('root-1', 'program-1', 'block-1', 'day-1')],
            ['programs.copyBlockDay', 'post', '/root-1/programs/program-1/blocks/block-1/days/day-1/copy', () => fractalProgramsApi.copyBlockDay('root-1', 'program-1', 'block-1', 'day-1', {})],
            ['programs.scheduleBlockDay', 'post', '/root-1/programs/program-1/blocks/block-1/days/day-1/schedule', () => fractalProgramsApi.scheduleBlockDay('root-1', 'program-1', 'block-1', 'day-1', {})],
            ['programs.unscheduleBlockDayOccurrence', 'post', '/root-1/programs/program-1/blocks/block-1/days/day-1/unschedule', () => fractalProgramsApi.unscheduleBlockDayOccurrence('root-1', 'program-1', 'block-1', 'day-1', {})],
            ['programs.attachGoalToBlock', 'post', '/root-1/programs/program-1/blocks/block-1/goals', () => fractalProgramsApi.attachGoalToBlock('root-1', 'program-1', 'block-1', { goal_id: 'goal-1' })],
            ['programs.attachGoalToDay', 'post', '/root-1/programs/program-1/blocks/block-1/days/day-1/goals', () => fractalProgramsApi.attachGoalToDay('root-1', 'program-1', 'block-1', 'day-1', { goal_id: 'goal-1' })],
            ['programs.setProgramGoalDeadline', 'post', '/root-1/programs/program-1/goal-deadlines', () => fractalProgramsApi.setProgramGoalDeadline('root-1', 'program-1', { goal_id: 'goal-1' })],

            ['sessions.createSession', 'post', '/root-1/sessions', () => fractalSessionsApi.createSession('root-1', { name: 'Session' })],
            ['sessions.completeQuickSession', 'post', '/root-1/sessions/quick-complete', () => fractalSessionsApi.completeQuickSession('root-1', { activities: [] })],
            ['sessions.updateSession', 'put', '/root-1/sessions/session-1', () => fractalSessionsApi.updateSession('root-1', 'session-1', { name: 'Session' })],
            ['sessions.deleteSession', 'delete', '/root-1/sessions/session-1', () => fractalSessionsApi.deleteSession('root-1', 'session-1')],
            ['sessions.duplicateSession', 'post', '/root-1/sessions/session-1/duplicate', () => fractalSessionsApi.duplicateSession('root-1', 'session-1')],
            ['sessions.pauseSession', 'post', '/root-1/timers/session/session-1/pause', () => fractalSessionsApi.pauseSession('root-1', 'session-1')],
            ['sessions.resumeSession', 'post', '/root-1/timers/session/session-1/resume', () => fractalSessionsApi.resumeSession('root-1', 'session-1')],
            ['sessions.addSessionGoal', 'post', '/root-1/sessions/session-1/goals', () => fractalSessionsApi.addSessionGoal('root-1', 'session-1', 'goal-1')],
            ['sessions.addActivityToSession', 'post', '/root-1/sessions/session-1/activities', () => fractalSessionsApi.addActivityToSession('root-1', 'session-1', { activity_definition_id: 'activity-1' })],
            ['sessions.removeActivityFromSession', 'delete', '/root-1/sessions/session-1/activities/instance-1', () => fractalSessionsApi.removeActivityFromSession('root-1', 'session-1', 'instance-1')],
            ['sessions.updateActivityMetrics', 'put', '/root-1/sessions/session-1/activities/instance-1/metrics', () => fractalSessionsApi.updateActivityMetrics('root-1', 'session-1', 'instance-1', { metrics: [] })],
            ['sessions.createSessionTemplate', 'post', '/root-1/session-templates', () => fractalSessionsApi.createSessionTemplate('root-1', { name: 'Template' })],
            ['sessions.createTemplateFromSession', 'post', '/root-1/sessions/session-1/create-template', () => fractalSessionsApi.createTemplateFromSession('root-1', 'session-1', { name: 'Template' })],
            ['sessions.updateSessionTemplate', 'put', '/root-1/session-templates/template-1', () => fractalSessionsApi.updateSessionTemplate('root-1', 'template-1', { name: 'Template' })],
            ['sessions.deleteSessionTemplate', 'delete', '/root-1/session-templates/template-1', () => fractalSessionsApi.deleteSessionTemplate('root-1', 'template-1')],
            ['sessions.createActivityInstance', 'post', '/root-1/activity-instances', () => fractalActivitiesApi.createActivityInstance('root-1', { session_id: 'session-1', activity_definition_id: 'activity-1' })],
            ['sessions.startActivityTimer', 'post', '/root-1/activity-instances/instance-1/start', () => fractalActivitiesApi.startActivityTimer('root-1', 'instance-1', {})],
            ['sessions.completeActivityInstance', 'post', '/root-1/activity-instances/instance-1/complete', () => fractalActivitiesApi.completeActivityInstance('root-1', 'instance-1', {})],
            ['sessions.updateActivityInstance', 'put', '/root-1/activity-instances/instance-1', () => fractalActivitiesApi.updateActivityInstance('root-1', 'instance-1', { completed: false })],

            ['notes.createNote', 'post', '/root-1/notes', () => fractalNotesApi.createNote('root-1', { content: 'Note' })],
            ['notes.updateNote', 'put', '/root-1/notes/note-1', () => fractalNotesApi.updateNote('root-1', 'note-1', { content: 'Note' })],
            ['notes.deleteNote', 'delete', '/root-1/notes/note-1', () => fractalNotesApi.deleteNote('root-1', 'note-1')],
            ['notes.pinNote', 'put', '/root-1/notes/note-1/pin', () => fractalNotesApi.pinNote('root-1', 'note-1')],
            ['notes.unpinNote', 'put', '/root-1/notes/note-1/unpin', () => fractalNotesApi.unpinNote('root-1', 'note-1')],

            ['analytics.createAnalyticsView', 'post', '/roots/root-1/dashboards', () => fractalMetaApi.createAnalyticsView('root-1', { name: 'Dashboard' })],
            ['analytics.updateAnalyticsView', 'put', '/roots/root-1/dashboards/dashboard-1', () => fractalMetaApi.updateAnalyticsView('root-1', 'dashboard-1', { name: 'Dashboard' })],
            ['analytics.deleteAnalyticsView', 'delete', '/roots/root-1/dashboards/dashboard-1', () => fractalMetaApi.deleteAnalyticsView('root-1', 'dashboard-1')],
        ];

        axios.defaults.adapter = async (config) => {
            calls.push({
                url: config.url,
                method: String(config.method || '').toLowerCase(),
                token: config.headers?.get?.('X-CSRF-Token') || config.headers?.['X-CSRF-Token'],
            });
            return {
                data: { ok: true },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        try {
            for (const [, , , invoke] of surfaceMutations) {
                await invoke();
            }
        } finally {
            axios.defaults.adapter = originalAdapter;
        }

        expect(calls).toHaveLength(surfaceMutations.length);
        surfaceMutations.forEach(([label, expectedMethod, expectedPath], index) => {
            const call = calls[index];
            expect({ label, method: call.method, url: call.url, token: call.token }).toMatchObject({
                label,
                method: expectedMethod,
                url: `${API_BASE}${expectedPath}`,
                token: 'surface-token',
            });
        });
    });

    it('keeps app network calls on the shared API core', () => {
        const violations = [];
        for (const filePath of listSourceFiles(repoSrcDir)) {
            const relativePath = path.relative(repoSrcDir, filePath);
            if (relativePath === path.join('utils', 'api', 'core.js')) continue;
            if (relativePath === path.join('utils', 'api', '__tests__', 'core.test.js')) continue;
            const source = fs.readFileSync(filePath, 'utf8');
            if (/from ['"]axios['"]/.test(source) || /import\s+axios\s+from ['"]axios['"]/.test(source)) {
                violations.push(`${relativePath}: raw axios import`);
            }
            if (/\bfetch\s*\(/.test(source)) {
                violations.push(`${relativePath}: fetch call`);
            }
        }
        expect(violations).toEqual([]);
    });
});
