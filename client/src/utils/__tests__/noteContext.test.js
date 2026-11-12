// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { formatSetMetrics, noteContextLink } from '../noteContext';

describe('formatSetMetrics', () => {
    it('reads a set as recorded, with units and splits', () => {
        expect(formatSetMetrics([
            { name: 'Weight', value: 80, unit: 'kg' },
            { name: 'reps', value: 5, unit: '' },
            { name: 'Hold', value: 30, unit: 's', split_name: 'Left' },
            { name: 'Empty', value: null, unit: 'kg' },
        ])).toBe('80 kg · 5 reps · Left 30 s');
        expect(formatSetMetrics()).toBe('');
        expect(formatSetMetrics(null)).toBe('');
    });
});

describe('noteContextLink', () => {
    it('leads to the session, goal or program a note was written on', () => {
        expect(noteContextLink({ session_id: 's', goal_id: 'g' }, 'r')).toEqual({ to: '/r/session/s', label: 'Open session' });
        expect(noteContextLink({ goal_id: 'g 1' }, 'r')).toEqual({ to: '/r/goals?goal=g%201', label: 'Open goal' });
        expect(noteContextLink({ context_type: 'program', context_id: 'p' }, 'r')).toEqual({ to: '/r/programs/p', label: 'Open program' });
        expect(noteContextLink({ context_type: 'program_date', program_id: 'p' }, 'r')).toEqual({ to: '/r/programs/p', label: 'Open program' });
        expect(noteContextLink({ context_type: 'root' }, 'r')).toBeNull();
    });
});
