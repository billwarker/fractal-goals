import { vi } from 'vitest';

/**
 * Shared API double and fixtures for ProgramDaysView tests. This module doubles
 * as the `utils/api` mock (it exports `fractalApi`), so it must not import app code:
 *
 *   vi.mock('../../../../utils/api', () => import('../../../../test/programs/programDaysFixtures'));
 */
export const programDaysApi = {
    getSession: vi.fn(),
    getProgramPlanOccurrences: vi.fn(),
    getProgramDayPlans: vi.fn(),
    saveProgramSessionPlan: vi.fn(),
    resetProgramSessionPlan: vi.fn(),
    loadProgramSessionPlan: vi.fn(),
    pullProgramSessionPlanTemplate: vi.fn(),
    getActivityTagCatalog: vi.fn(),
};
export const fractalApi = new Proxy({}, { get: (_, key) => programDaysApi[key] });

export const bench = {
    id: 'bench', name: 'Bench Press', has_sets: true,
    metric_definitions: [{ id: 'w', name: 'Weight', unit: 'kg' }, { id: 'r', name: 'Reps', unit: 'reps' }],
};
// Program days belong to the program; the block only labels the dates it covers.
export const program = {
    id: 'program', start_date: '2026-09-01', end_date: '2026-10-31',
    blocks: [{
        id: 'block-1', name: 'Hypertrophy', start_date: '2026-09-01', end_date: '2026-10-31',
        track_weeks: true, week_start_day: 0,
    }],
    days: [
        { id: 'upper', name: 'Upper A', day_number: 1, templates: [{ id: 'tmpl', name: 'Bench Day' }] },
        { id: 'rest', name: 'Rest', day_number: 2, templates: [] },
    ],
};

export function planEntry(overrides = {}) {
    return {
        template: { id: 'tmpl', name: 'Bench Day', color: '#336699', revision: 1 },
        is_required: true,
        date: '2026-10-05',
        plan_id: null,
        row_version: null,
        source: 'template',
        seeded_from_date: null,
        template_changed: false,
        sections: [{ name: 'Main', items: [{
            type: 'activity', activity_definition_id: 'bench', name: 'Bench Press', item_key: 'k1',
            prescription: { schema: 1, sets: [{ metrics: [{ metric_id: 'w', split_id: null, value: 100 }] }] },
        }] }],
        previous: { date: '2026-09-28', sections: [{ name: 'Main', items: [{
            item_key: 'k1', prescription: { schema: 1, sets: [{ metrics: [{ metric_id: 'w', split_id: null, value: 100 }] }] },
        }] }] },
        executed_sessions: [],
        ...overrides,
    };
}

export const WEEK_ONE = planEntry({
    date: '2026-09-28', plan_id: 'p0', row_version: 1, source: 'plan', seeded_from_date: null, previous: null,
});

export function plansFor(overridesByDate = {}) {
    return (_root, _program, _day, date) => Promise.resolve({ data: { date, plans: [
        overridesByDate[date] || (date === '2026-09-28' ? WEEK_ONE : planEntry()),
    ] } });
}

/** Default responses: week one planned and met, the next Monday seeded from the template. */
export function resetProgramDaysApi() {
    const api = programDaysApi;
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getActivityTagCatalog.mockResolvedValue({ data: { tags: [] } });
    api.getProgramPlanOccurrences.mockResolvedValue({ data: { program_id: 'program', days: [{ day_id: 'upper', dates: [
        {
            date: '2026-09-28', templates: [{ template_id: 'tmpl', state: 'planned', plan_id: 'p0' }],
            state: 'scheduled_met', manual_status: null, closed: true, program_day_completed: true,
            sessions: [{ id: 'sess-1', name: 'Bench Day', completed: true }],
        },
        {
            date: '2026-10-05', templates: [{ template_id: 'tmpl', state: 'seeded', plan_id: null }],
            state: 'scheduled_pending', manual_status: null, closed: false, program_day_completed: false,
            sessions: [],
        },
    ] }] } });
    api.getProgramDayPlans.mockImplementation(plansFor());
}
