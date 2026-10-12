import { describe, expect, it } from 'vitest';

import { groupProgramsByStatus } from '../programPicker';

const today = '2026-10-12';
const programs = [
    { id: 'past-old', name: 'Base Phase', start_date: '2026-01-01', end_date: '2026-02-01' },
    { id: 'past-new', name: 'Peak Phase', start_date: '2026-06-01', end_date: '2026-09-01' },
    { id: 'now', name: 'Autumn Block', start_date: '2026-10-01', end_date: '2026-12-01' },
    { id: 'later', name: 'Winter Block', start_date: '2027-01-05', end_date: '2027-03-01' },
    { id: 'soon', name: 'Taper', start_date: '2026-12-15T00:00:00', end_date: '2026-12-31' },
];

describe('groupProgramsByStatus', () => {
    it('buckets by status and sorts upcoming by start, completed by latest end', () => {
        const groups = groupProgramsByStatus(programs, { today });
        expect(groups.active.map((program) => program.id)).toEqual(['now']);
        expect(groups.upcoming.map((program) => program.id)).toEqual(['soon', 'later']);
        expect(groups.completed.map((program) => program.id)).toEqual(['past-new', 'past-old']);
    });

    it('matches the query against names case-insensitively, ignoring surrounding space', () => {
        const groups = groupProgramsByStatus(programs, { query: '  BLOCK ', today });
        expect([...groups.active, ...groups.upcoming].map((program) => program.id)).toEqual(['now', 'later']);
        expect(groups.completed).toEqual([]);
    });

    it('applies the status filter after the query', () => {
        const groups = groupProgramsByStatus(programs, { query: 'phase', filter: 'active', today });
        expect(groups).toEqual({ active: [], upcoming: [], completed: [] });
    });

    it('skips undated programs instead of failing', () => {
        const groups = groupProgramsByStatus([...programs, { id: 'undated', name: 'Draft', start_date: null, end_date: null }], { today });
        expect(Object.values(groups).flat().map((program) => program.id)).not.toContain('undated');
    });
});
