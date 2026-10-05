import {
    describeFocusConflicts,
    expandFocusScope,
    focusError,
    goalsInScope,
    isPrunableFocusConflict,
    programFocusScope,
} from '../programFocus';

const goals = [
    { id: 'root', name: 'Root', parent_id: null },
    { id: 'strength', name: 'Strength', parent_id: 'root' },
    { id: 'squat', name: 'Squat', parent_id: 'strength' },
    { id: 'mobility', name: 'Mobility', parent_id: 'root' },
    { id: 'hips', name: 'Hips', parent_id: 'mobility' },
];

describe('programFocus', () => {
    it('expands seeds through descendants and ignores unknown goals', () => {
        expect([...expandFocusScope(goals, ['strength', 'missing'])].sort()).toEqual(['squat', 'strength']);
    });

    it('limits program-day goals to the program goals and their descendants', () => {
        const scope = programFocusScope(goals, { goal_ids: ['mobility'] });
        expect([...scope].sort()).toEqual(['hips', 'mobility']);
        expect(goalsInScope(goals, scope).map((goal) => goal.id)).toEqual(['mobility', 'hips']);
        expect(programFocusScope(goals, null).size).toBe(0);
    });

    it('reads structured day-goal errors and recognises prunable conflicts', () => {
        const conflict = { response: { status: 409, data: {
            code: 'program_day_goal_out_of_scope', error: 'Stranded',
            conflicts: [{ name: 'Heavy', goal_name: 'Squat' }],
        } } };
        expect(focusError(conflict)).toEqual({
            code: 'program_day_goal_out_of_scope', message: 'Stranded',
            conflicts: [{ name: 'Heavy', goal_name: 'Squat' }], conflictCount: 1,
        });
        expect(isPrunableFocusConflict(conflict)).toBe(true);
        expect(isPrunableFocusConflict({ response: { status: 400, data: { code: 'program_day_goal_out_of_scope' } } })).toBe(false);
        expect(focusError({ response: { data: { code: 'program_block_overlap' } } })).toBeNull();
        expect(describeFocusConflicts(conflict.response.data.conflicts)).toEqual(['Heavy: Squat']);
    });
});
