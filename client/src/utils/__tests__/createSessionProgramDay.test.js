import { buildTodayProgramDayView, partitionTemplatesByProgram, programSessionToTemplate } from '../createSessionProgramDay';

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

    it('returns an empty, incomplete view for no days', () => {
        expect(buildTodayProgramDayView([])).toMatchObject({
            hasProgramDayToday: false,
            totalRequired: 0,
            completedCount: 0,
            isDayComplete: false,
        });
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
