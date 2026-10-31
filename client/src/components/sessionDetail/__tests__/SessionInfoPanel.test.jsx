import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import SessionInfoPanel from '../SessionInfoPanel';

const updateSession = vi.fn(() => Promise.resolve());
const sessionState = vi.hoisted(() => ({ value: null, instances: [], circuitRuns: [] }));

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: () => ({
        rootId: 'root-1',
        session: sessionState.value,
        localSessionData: {
            template_name: 'Full Body Workout',
            session_start: '2026-01-01T00:00:00Z',
            session_end: null,
            total_duration_minutes: 30
        },
        activityInstances: sessionState.instances,
        circuitRuns: sessionState.circuitRuns,
    }),
    useActiveSessionActions: () => ({
        updateSession
    })
}));

vi.mock('../../../contexts/TimezoneContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTimezone: () => ({ timezone: 'UTC' })
    };
});

describe('SessionInfoPanel', () => {
    beforeEach(() => {
        updateSession.mockClear();
        sessionState.value = {
            id: 's1',
            name: 'Test Session',
            template_color: '#22c55e',
            created_at: '2026-01-01T00:00:00Z',
            program_info: null,
        };
        sessionState.instances = [{ id: 'done', duration_seconds: 120 }];
        sessionState.circuitRuns = [];
    });

    it('submits edited start time through async updateSession', async () => {
        renderWithProviders(<SessionInfoPanel />, {
            withTimezone: false,
            withAuth: false,
            withGoalLevels: false,
            withTheme: false
        });

        fireEvent.click(screen.getByTitle('Expand'));
        fireEvent.click(screen.getByTitle('Edit start time'));

        const input = screen.getByDisplayValue('2026-01-01T00:00');
        fireEvent.change(input, { target: { value: '2026-01-01T01:15' } });

        const saveButton = screen.getAllByRole('button', { name: 'Save time' })[0];
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(updateSession).toHaveBeenCalledTimes(1);
        });

        expect(updateSession).toHaveBeenCalledWith({
            session_start: '2026-01-01T01:15:00.000Z'
        });
    });

    it('uses one shared template badge in the header without redundant metadata', () => {
        renderWithProviders(<SessionInfoPanel />, {
            withTimezone: false,
            withAuth: false,
            withGoalLevels: false,
            withTheme: false
        });

        expect(screen.getByText('Full Body Workout')).toHaveStyle({ color: '#22c55e' });

        fireEvent.click(screen.getByTitle('Expand'));
        const templateBadges = screen.getAllByText('Full Body Workout');
        expect(templateBadges).toHaveLength(1);
    });

    it('shows colored program, block, and program-day information', () => {
        sessionState.value = {
            ...sessionState.value,
            program_info: {
                program_id: 'program-1',
                program_name: 'Q4 2026',
                program_color: '#22c55e',
                block_id: 'block-1',
                block_name: 'Month 1',
                block_color: '#d946ef',
                day_id: 'day-1',
                day_name: 'Sunday Practice',
                day_number: 1,
            },
        };

        renderWithProviders(<SessionInfoPanel />, {
            withTimezone: false,
            withAuth: false,
            withGoalLevels: false,
            withTheme: false,
        });

        expect(screen.getByTestId('program-context')).toHaveStyle({
            '--session-program-color': '#22c55e',
            '--session-block-color': '#d946ef',
        });
        expect(screen.getByRole('link', { name: 'Q4 2026' }).className).toContain('programValue');
        expect(screen.getByText('Month 1').className).toContain('blockValue');
        expect(screen.getByText('Day 1 — Sunday Practice').className).toContain('blockValue');
    });

    describe('live activity duration', () => {
        const activityTime = () => screen.getByText('Activity').nextElementSibling;
        const renderPanel = () => renderWithProviders(<SessionInfoPanel />, {
            withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false,
        });

        afterEach(() => vi.useRealTimers());

        it('adds running timers to the recorded total and keeps ticking', () => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
            vi.setSystemTime(new Date('2026-01-01T00:10:30Z'));
            sessionState.instances = [
                { id: 'done', duration_seconds: 120 },
                { id: 'running', time_start: '2026-01-01T00:10:00Z', duration_seconds: null },
            ];
            sessionState.circuitRuns = [{ id: 'run', status: 'active', time_start: '2026-01-01T00:10:20Z' }];
            renderPanel();
            // 120 recorded + 30 on the running instance + 10 on the active circuit.
            expect(activityTime()).toHaveTextContent('02:40');
            act(() => { vi.advanceTimersByTime(1000); });
            expect(activityTime()).toHaveTextContent('02:42');
        });

        it('holds still while the session is paused', () => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
            vi.setSystemTime(new Date('2026-01-01T00:10:30Z'));
            sessionState.value = { ...sessionState.value, is_paused: true, last_paused_at: '2026-01-01T00:10:10Z' };
            sessionState.instances = [{ id: 'running', time_start: '2026-01-01T00:10:00Z' }];
            renderPanel();
            expect(activityTime()).toHaveTextContent('00:10');
            act(() => { vi.advanceTimersByTime(5000); });
            expect(activityTime()).toHaveTextContent('00:10');
        });

        it('shows the recorded total, unchanged, when nothing runs', () => {
            renderPanel();
            expect(activityTime()).toHaveTextContent('02:00');
        });
    });
});
