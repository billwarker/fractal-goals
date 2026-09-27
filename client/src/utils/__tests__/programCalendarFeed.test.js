import { nestContributingSessionsInProgramDays } from '../programDayState';
import { attachFeedBlocks, buildCalendarFeedEvents, mergeCalendarFeedChunks } from '../programCalendarFeed';

const program = { id: 'p1', name: 'Base', color: '#112233', start_date: '2026-08-20', end_date: '2026-10-05' };
const block = { id: 'b1', program_id: 'p1', name: 'Build', color: '#445566', start_date: '2026-08-20', end_date: '2026-10-05' };
const day = (date, extra = {}) => ({
    program_id: 'p1',
    date,
    scheduled: true,
    state: 'scheduled_met',
    chain_role: 'member',
    occurrences: [{
        program_day_id: 'd1',
        name: 'Push',
        block_id: 'b1',
        block_color: '#445566',
        requirements_met: true,
        goal_ids: [],
        templates: [{ id: 't1', name: 'Push', color: '#fff', is_required: true }],
    }],
    ...extra,
});

const august = {
    programs: [program],
    blocks: [block],
    program_days: [day('2026-08-31')],
    completed_session_days: [],
    periods: [{ id: 'v1', name: 'Trip', start_date: '2026-08-30', end_date: '2026-09-02', kind: 'travel' }],
};
const september = {
    programs: [program],
    blocks: [block],
    program_days: [day('2026-09-01')],
    completed_session_days: [{
        date: '2026-09-01',
        completed_sessions: [{ id: 's1', name: 'Push', template_id: 't1', program_day_ids: ['d1'] }],
    }],
    periods: [{ id: 'v1', name: 'Trip', start_date: '2026-08-30', end_date: '2026-09-02', kind: 'travel' }],
};

describe('programCalendarFeed', () => {
    it('merges chunks, deduplicating spans that cross month edges', () => {
        const merged = mergeCalendarFeedChunks([august, undefined, september]);
        expect(merged.programs).toHaveLength(1);
        expect(merged.blocks).toHaveLength(1);
        expect(merged.periods).toHaveLength(1);
        expect(merged.programDays.map((item) => item.date)).toEqual(['2026-08-31', '2026-09-01']);
        expect(merged.completedSessionDays).toHaveLength(1);
        expect(mergeCalendarFeedChunks([]).programs).toEqual([]);
    });

    it('attaches in-view blocks to program summaries', () => {
        expect(attachFeedBlocks([program, { id: 'p2' }], [block])).toEqual([
            { ...program, blocks: [block] },
            { id: 'p2', blocks: [] },
        ]);
    });

    it('builds the event shapes the calendar consumes and nests credited sessions', () => {
        const feed = mergeCalendarFeedChunks([august, september]);
        const events = nestContributingSessionsInProgramDays(
            buildCalendarFeedEvents({ feed, programs: [program], selectedProgramId: 'p1' }),
        );
        const byType = (type) => events.filter((event) => event.extendedProps?.type === type);

        expect(byType('program_background')).toEqual([expect.objectContaining({
            id: 'program-bg-p1', start: '2026-08-20', end: '2026-10-06', backgroundColor: '#112233', display: 'background',
        })]);
        expect(byType('block_background')).toEqual([expect.objectContaining({
            id: 'block-bg-p1-b1', backgroundColor: '#445566',
        })]);
        const ribbons = byType('program_day');
        expect(ribbons.map((event) => event.id)).toEqual(['pday-p1-2026-08-31-d1', 'pday-p1-2026-09-01-d1']);
        expect(ribbons[1].extendedProps).toEqual(expect.objectContaining({
            programId: 'p1', pDayId: 'd1', blockColor: '#445566', isCompleted: true,
            dayState: expect.objectContaining({ date: '2026-09-01', state: 'scheduled_met' }),
        }));
        expect(ribbons[1].extendedProps.contributingSessions).toHaveLength(1);
        expect(byType('completed_session')).toEqual([]);
        expect(byType('calendar_period')).toHaveLength(1);
    });

    it('keeps fallback program colors stable by the full program order', () => {
        const uncoloured = { ...program, color: null };
        const feed = mergeCalendarFeedChunks([{ ...september, programs: [uncoloured], blocks: [] }]);
        const first = buildCalendarFeedEvents({ feed, programs: [{ id: 'p0' }, uncoloured] });
        const second = buildCalendarFeedEvents({ feed, programs: [{ id: 'p0' }, uncoloured] });
        const colour = (events) => events.find((event) => event.id === 'program-bg-p1').backgroundColor;
        expect(colour(first)).toBe(colour(second));
        expect(colour(first)).toBeTruthy();
    });
});
