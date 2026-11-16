// @vitest-environment node
import { buildPreviousProgramDays } from '../createSessionProgramDay';
import { buildTodayProgramDayView, partitionTemplatesByProgram, programSessionToTemplate } from '../createSessionProgramDay';

describe('buildPreviousProgramDays', () => {
    const program = {
        id: 'p', name: 'Q4', color: '#f80', goal_ids: ['g'],
        days: [
            { id: 'legs', name: 'Legs', day_number: 1, templates: [{ id: 't1' }] },
            { id: 'gone', name: 'Old', day_number: 2, templates: [{ id: 'deleted' }] },
        ],
    };
    const templates = [{ id: 't1', name: 'Legs A', template_data: { sections: [] } }];
    const occurrencesByDay = new Map([
        ['legs', [
            { date: '2026-11-05', program_day_completed: true },
            { date: '2026-11-07', manual_status: null },
            { date: '2026-11-08' },
        ]],
        ['gone', [{ date: '2026-11-06', manual_status: 'rest' }]],
    ]);
    const build = (overrides = {}) => buildPreviousProgramDays({
        program, occurrencesByDay, templates, todayISO: '2026-11-08', ...overrides,
    });

    it('lists each day type once, most recently occurred first, without today or a block', () => {
        const rows = build();
        expect(rows.map((row) => [row.day_id, row.last_date, row.last_status_label])).toEqual([
            ['legs', '2026-11-07', 'Not done'],
            ['gone', '2026-11-06', 'Rest'],
        ]);
        expect(rows[0].is_previous).toBe(true);
        expect(rows[0].block_id).toBeUndefined();
    });

    it('leaves out days scheduled today and days that have not occurred yet', () => {
        expect(build({ scheduledToday: [{ day_id: 'legs' }] }).map((row) => row.day_id)).toEqual(['gone']);
        expect(build({ todayISO: '2026-11-01' })).toEqual([]);
    });

    it('takes template data from the loaded templates and leaves a deleted one with no sessions', () => {
        const rows = build();
        expect(rows[0].sessions[0]).toMatchObject({ template_id: 't1', template_data: { sections: [] } });
        expect(rows[1].sessions).toEqual([]);
    });

    it('has nothing without a program or occurrences', () => {
        expect(build({ program: null })).toEqual([]);
        expect(build({ occurrencesByDay: undefined })).toEqual([]);
    });
});

describe('createSessionProgramDay', () => {
    it('preserves the configured template color when adapting a program session', () => {
        expect(programSessionToTemplate({
            template_id: 'template-1',
            template_name: 'Practice',
            template_description: 'Focused work',
            template_data: { template_color: '#d946ef' },
        })).toMatchObject({
            id: 'template-1',
            name: 'Practice',
            template_color: '#d946ef',
        });
    });

    it('derives required, optional, completed, and minimum state', () => {
        const view = buildTodayProgramDayView([{
            day_id: 'day-1',
            sessions: [
                { template_id: 'required', is_required: true, order: 2 },
                { template_id: 'optional', is_required: false, order: 1 },
            ],
            completed_template_ids: ['required'],
            completed_session_count: 1,
            completion_min_templates: 1,
        }]);
        expect(view.hasProgramDayToday).toBe(true);
        expect([...view.requiredTemplateIds]).toEqual(['required']);
        expect([...view.allTemplateIds]).toEqual(['optional', 'required']);
        expect(view.completedCount).toBe(1);
        expect(view.minTemplates).toBe(1);
        expect(view.isDayComplete).toBe(true);
    });

    it('takes the server\'s verdict, which counts the day\'s activities too', () => {
        const day = {
            day_id: 'day-1',
            sessions: [{ template_id: 'warmup', is_required: false }],
            completed_template_ids: ['warmup'],
            activity_conditions: [{ id: 'lever', is_required: true, completed: false }],
        };
        expect(buildTodayProgramDayView([{ ...day, requirements_met: false }]).isDayComplete).toBe(false);
        expect(buildTodayProgramDayView([{ ...day, sessions: [], requirements_met: true }]).isDayComplete).toBe(true);
    });

    it('returns an empty, incomplete view for no days', () => {
        expect(buildTodayProgramDayView([])).toMatchObject({
            hasProgramDayToday: false,
            totalRequired: 0,
            completedCount: 0,
            isDayComplete: false,
        });
    });

    it('treats overlapping occurrence minimums as one per-day threshold', () => {
        const view = buildTodayProgramDayView([
            {
                sessions: [
                    { template_id: 'a', is_required: false },
                    { template_id: 'b', is_required: false },
                ],
                completed_template_ids: ['a'],
                completion_min_templates: 2,
            },
            {
                sessions: [
                    { template_id: 'b', is_required: false },
                    { template_id: 'c', is_required: false },
                ],
                completed_template_ids: ['b'],
                completion_min_templates: 2,
            },
        ]);

        expect(view.minTemplates).toBe(2);
        expect([...view.completedTemplateIds]).toEqual(['a', 'b']);
        expect(view.isDayComplete).toBe(true);
    });

    it('uses occurrence-level manual status without inventing completed sessions', () => {
        const baseDay = {
            program_id: 'program-1',
            sessions: [{ template_id: 'practice', is_required: true }],
            completed_template_ids: [],
            completed_session_count: 0,
        };
        const complete = buildTodayProgramDayView([{ ...baseDay, manual_status: 'complete' }]);
        expect(complete.isDayComplete).toBe(true);
        expect(complete.completedCount).toBe(0);

        const rest = buildTodayProgramDayView([{ ...baseDay, manual_status: 'rest' }]);
        expect(rest.isDayRest).toBe(true);
        expect(rest.isDayComplete).toBe(false);
    });

    it('partitions templates without changing recency order', () => {
        const templates = [
            { id: 'other', updated_at: '2026-01-02' },
            { id: 'program-old', updated_at: '2026-01-01' },
            { id: 'program-new', updated_at: '2026-01-03' },
        ];
        const result = partitionTemplatesByProgram(templates, new Set(['program-old', 'program-new']));
        expect(result.programTemplates.map((item) => item.id)).toEqual(['program-new', 'program-old']);
        expect(result.otherTemplates.map((item) => item.id)).toEqual(['other']);
    });
});
