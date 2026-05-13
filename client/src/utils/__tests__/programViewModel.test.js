import { describe, expect, it } from 'vitest';

import {
    buildProgramBlockLabels,
    buildProgramCalendarEvents,
    buildProgramsCalendarEvents,
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
});
