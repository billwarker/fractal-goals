import { describe, expect, it } from 'vitest';

import { getProgramsAffectedByGoalCompletion } from '../goalCompletionPrograms';

const treeData = {
    id: 'root',
    name: 'Root',
    children: [
        {
            id: 'parent',
            name: 'Parent',
            children: [
                { id: 'child', name: 'Child', children: [] },
            ],
        },
    ],
};

describe('getProgramsAffectedByGoalCompletion', () => {
    it('returns only active scoped programs when completing a goal', () => {
        const programs = [
            {
                id: 'active-program',
                name: 'Active Program',
                goal_ids: ['parent'],
                start_date: '2026-07-01',
                end_date: '2026-07-31',
                is_active: true,
            },
            {
                id: 'upcoming-program',
                name: 'Upcoming Program',
                goal_ids: ['child'],
                start_date: '2026-08-01',
                end_date: '2026-08-31',
                is_active: false,
            },
            {
                id: 'unscoped-program',
                name: 'Unscoped Program',
                goal_ids: ['other'],
                start_date: '2026-07-01',
                end_date: '2026-07-31',
                is_active: true,
            },
        ];

        expect(getProgramsAffectedByGoalCompletion({
            programs,
            treeData,
            goalId: 'child',
            mode: 'complete',
            referenceDate: new Date('2026-07-06T12:00:00Z'),
        }).map((program) => program.id)).toEqual(['active-program']);
    });

    it('returns scoped programs whose date window contained the previous completion', () => {
        const programs = [
            {
                id: 'previous-program',
                name: 'Previous Program',
                blocks: [{ goal_ids: ['child'], days: [] }],
                start_date: '2026-05-01',
                end_date: '2026-05-31',
                is_active: false,
            },
            {
                id: 'active-program',
                name: 'Active Program',
                goal_ids: ['child'],
                start_date: '2026-07-01',
                end_date: '2026-07-31',
                is_active: true,
            },
        ];

        expect(getProgramsAffectedByGoalCompletion({
            programs,
            treeData,
            goalId: 'child',
            mode: 'uncomplete',
            completedAt: '2026-05-03T18:03:00Z',
        }).map((program) => program.id)).toEqual(['previous-program']);
    });
});
