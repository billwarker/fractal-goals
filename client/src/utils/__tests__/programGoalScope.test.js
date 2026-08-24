import { getGoalLineageScope } from '../../components/flowTree/flowTreeTreeUtils';
import {
    collectProgramGoalIds,
    getActiveProgramBlock,
    getActivePrograms,
    getProgramStatus,
} from '../programGoalWindow';

describe('program goal-tree scope', () => {
    it('collects program, block, and day goal associations without duplicates', () => {
        expect(collectProgramGoalIds({
            goal_ids: ['parent'],
            selected_goals: ['parent'],
            blocks: [{
                goal_ids: ['child'],
                days: [{ goal_ids: ['leaf', 'child'] }],
            }],
        })).toEqual(['parent', 'child', 'leaf']);
    });

    it('expands each associated goal to its full ancestors and descendants', () => {
        const tree = {
            id: 'root',
            children: [
                {
                    id: 'parent',
                    children: [
                        { id: 'selected', children: [{ id: 'descendant', children: [] }] },
                        { id: 'sibling', children: [] },
                    ],
                },
                { id: 'outside', children: [] },
            ],
        };

        expect(Array.from(getGoalLineageScope(tree, ['selected']))).toEqual([
            'root',
            'parent',
            'selected',
            'descendant',
        ]);
    });

    it('uses inclusive program dates and deterministically orders overlapping active programs', () => {
        const programs = [
            { id: 'b', name: 'Beta', start_date: '2026-08-23', end_date: '2026-08-30' },
            { id: 'a', name: 'Alpha', start_date: '2026-08-23', end_date: '2026-08-23' },
            { id: 'past', name: 'Past', start_date: '2026-08-01', end_date: '2026-08-22' },
            { id: 'future', name: 'Future', start_date: '2026-08-24', end_date: '2026-08-30' },
        ];

        expect(getProgramStatus(programs[1], '2026-08-23')).toBe('active');
        expect(getProgramStatus(programs[2], '2026-08-23')).toBe('completed');
        expect(getProgramStatus(programs[3], '2026-08-23')).toBe('upcoming');
        expect(getActivePrograms(programs, '2026-08-23').map((program) => program.id)).toEqual(['a', 'b']);
    });

    it('resolves the current block using the same inclusive reference date', () => {
        const program = { blocks: [
            { id: 'past', start_date: '2026-08-01', end_date: '2026-08-22' },
            { id: 'current', start_date: '2026-08-23T00:00:00Z', end_date: '2026-08-30T00:00:00Z' },
        ] };

        expect(getActiveProgramBlock(program, '2026-08-23')?.id).toBe('current');
        expect(getActiveProgramBlock(program, '2026-08-31')).toBeNull();
    });
});
