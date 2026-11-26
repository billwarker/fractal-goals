import { describe, expect, it } from 'vitest';

import { menuDestination, timerSession } from '../NativeShellBridge';
import { planReminders } from '../reminders';

describe('the menu bar timer', () => {
    const start = Date.parse('2026-11-25T10:00:00Z');

    it('counts time worked, leaving out pauses', () => {
        const session = { id: 's', root_id: 'r', name: 'Legs', session_start: '2026-11-25T10:00:00Z', total_paused_seconds: 60 };
        expect(timerSession(session, 'r', start + 600_000)).toEqual({
            title: 'Legs', path: '/r/session/s', elapsedSeconds: 540, running: true,
        });
        const paused = { ...session, is_paused: true, last_paused_at: '2026-11-25T10:05:00Z' };
        expect(timerSession(paused, 'r', start + 600_000)).toMatchObject({ elapsedSeconds: 240, running: false });
    });

    it('shows nothing without a session that has begun', () => {
        expect(timerSession(null, 'r')).toBeNull();
        expect(timerSession({ id: 's' }, 'r')).toBeNull();
    });
});

describe('menu choices', () => {
    it('open pages of the fractal last visited', () => {
        expect(menuDestination('page:notes', 'r')).toBe('/r/notes');
        expect(menuDestination('new-session', 'r')).toBe('/r/create-session');
        expect(menuDestination('fractals', 'r')).toBe('/');
        expect(menuDestination('back', 'r')).toBe(-1);
    });

    it('lead to the fractal list before any fractal is open', () => {
        expect(menuDestination('page:goals', null)).toBe('/');
        expect(menuDestination('new-session', null)).toBe('/');
        expect(menuDestination('something-else', null)).toBeNull();
    });
});

describe('reminders', () => {
    const now = new Date(2026, 10, 25, 10, 30);
    const item = (kind, date, extra = {}) => ({
        id: `${kind}:x:${date}`, kind, date, title: 'Run a marathon', root_name: 'Fitness', path: '/r/goals?goal=x', ...extra,
    });
    const at = (reminder) => reminder.at;

    it('arrive on the morning they are due', () => {
        const [reminder] = planReminders({ reminders: [item('program_day', '2026-11-27')] }, null, now);
        expect(reminder).toMatchObject({ id: 'program_day:x:2026-11-27', title: 'Today: Run a marathon', body: 'Fitness', path: '/r/goals?goal=x' });
        expect(at(reminder)).toEqual({ year: 2026, month: 11, day: 27, hour: 9, minute: 0 });
    });

    it('move a review already due to the next morning, and drop a program day that has passed', () => {
        const planned = planReminders({ reminders: [item('goal_review', '2026-11-20'), item('program_day', '2026-11-25')] }, null, now);
        expect(planned.map(({ id }) => id)).toEqual(['goal_review:x:2026-11-20']);
        expect(at(planned[0])).toEqual({ year: 2026, month: 11, day: 26, hour: 9, minute: 0 });
    });

    it('remind of a session three hours after it began, unless switched off', () => {
        const session = { id: 's', root_id: 'r', name: 'Legs', session_start: new Date(2026, 10, 25, 9, 0).toISOString() };
        const [reminder] = planReminders({ reminders: [] }, session, now);
        expect(reminder).toMatchObject({ id: 'open_session:s', path: '/r/session/s', title: '“Legs” is still running' });
        expect(at(reminder)).toMatchObject({ day: 25, hour: 12, minute: 0 });
        expect(planReminders({ reminders: [], preferences: { open_session: false } }, session, now)).toEqual([]);
    });

    it('keep to the soonest sixty, which is what macOS allows', () => {
        const many = Array.from({ length: 70 }, (_, index) => item('program_day', `2026-12-${String((index % 28) + 1).padStart(2, '0')}`, { id: `d${index}` }));
        const planned = planReminders({ reminders: many }, null, now);
        expect(planned).toHaveLength(60);
        expect(at(planned[0]).day).toBe(1);
    });
});
