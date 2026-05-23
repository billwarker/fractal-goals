import { describe, expect, it } from 'vitest';

import {
    buildProgramBlockLabels,
    buildProgramCalendarEvents,
    buildProgramSidePaneData,
    buildProgramsCalendarEvents,
    getProgramColor,
} from '../programViewModel';

const program = {
    id: 'program-1',
    name: 'Test Program',
    start_date: '2026-05-17',
    end_date: '2026-05-30',
    blocks: [
        {
            id: 'block-1',
            name: 'Block 1',
            start_date: '2026-05-17',
            end_date: '2026-05-23',
            color: '#3A86FF',
            days: [],
        },
    ],
};

describe('programViewModel calendar builders', () => {
    it('uses explicit program color before block colors and fallback palette', () => {
        expect(getProgramColor({ ...program, color: '#EF476F' })).toBe('#EF476F');
        expect(getProgramColor(program)).toBe('#3A86FF');
        expect(getProgramColor({ blocks: [] }, 1)).toBe('#06A77D');
    });

    it('keeps block labels out of FullCalendar event data', () => {
        const events = buildProgramCalendarEvents({
            program,
            goals: [],
            sessions: [],
            getGoalColor: () => '#3A86FF',
            getGoalTextColor: () => '#ffffff',
        });

        expect(events.some((event) => event.extendedProps?.type === 'block_background')).toBe(true);
        expect(events.some((event) => event.extendedProps?.type === 'block_label')).toBe(false);
    });

    it('builds explicit block-label metadata for the first date of each block', () => {
        expect(buildProgramBlockLabels({ program, includeProgramId: true })).toEqual([
            expect.objectContaining({
                id: 'block-label-program-1-block-1',
                title: 'Block 1',
                date: '2026-05-17',
                startDate: '2026-05-17',
                endDate: '2026-05-23',
                programId: 'program-1',
                blockId: 'block-1',
                blockColor: '#3A86FF',
            }),
        ]);
    });

    it('keeps aggregate program calendar events free of metadata-only labels', () => {
        const events = buildProgramsCalendarEvents(
            [program],
            [],
            () => '#3A86FF',
            () => '#ffffff',
            'UTC',
        );

        expect(events.some((event) => event.id === 'program-bg-program-1')).toBe(true);
        expect(events.some((event) => event.extendedProps?.type === 'block_label')).toBe(false);
    });

    it('uses program-window goal scope for side pane fallback data', () => {
        const scopedProgram = {
            ...program,
            start_date: '2026-05-22',
            end_date: '2026-05-26',
            goal_ids: ['root'],
            blocks: [],
        };
        const rootGoal = {
            id: 'root',
            name: 'Root',
            type: 'LongTermGoal',
            children: [
                {
                    id: 'before',
                    name: 'Completed Before',
                    type: 'MidTermGoal',
                    completed: true,
                    completed_at: '2026-05-01T12:00:00Z',
                    children: [],
                },
                {
                    id: 'during',
                    name: 'Completed During',
                    type: 'MidTermGoal',
                    completed: true,
                    completed_at: '2026-05-24T12:00:00Z',
                    children: [],
                },
                {
                    id: 'active',
                    name: 'Active',
                    type: 'MidTermGoal',
                    completed: false,
                    children: [],
                },
            ],
        };
        const goals = [
            rootGoal,
            ...rootGoal.children,
        ];
        const byId = Object.fromEntries(goals.map((goal) => [goal.id, goal]));

        const data = buildProgramSidePaneData({
            program: scopedProgram,
            goals,
            getGoalDetails: (goalId) => byId[goalId] || null,
        });

        expect(data.programGoalSeeds).toHaveLength(1);
        expect(data.programGoalSeeds[0].children.map((goal) => goal.id)).toEqual(['during', 'active']);
        expect(data.programMetrics.totalGoals).toBe(3);
    });
});
