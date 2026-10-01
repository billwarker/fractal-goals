import React from 'react';
import { fireEvent, render as testingLibraryRender, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = {
    getSession: vi.fn(),
    getProgramPlanOccurrences: vi.fn(),
    getProgramDayPlans: vi.fn(),
    saveProgramSessionPlan: vi.fn(),
    resetProgramSessionPlan: vi.fn(),
    pullProgramSessionPlanTemplate: vi.fn(),
    getActivityTagCatalog: vi.fn(),
};
vi.mock('../../../../utils/api', () => ({ fractalApi: new Proxy({}, { get: (_, key) => api[key] }) }));
vi.mock('../../../../contexts/GoalLevelsContext', () => ({ useGoalLevels: () => ({ getGoalColor: () => '#336699' }) }));
vi.mock('../../../../hooks/useCircuitQueries', () => ({ useCircuits: () => ({ data: [{
    id: 'circ', name: 'Core Finisher',
    slots: [{ id: 's1', activity_definition_id: 'bench', activity: { name: 'Hollow Hold' } }],
}] }) }));

import ProgramDaysView from '../ProgramDaysView';
import useProgramDaysTab from '../../../../hooks/useProgramDaysTab';
import {
    describeOccurrenceDate,
    pickComparisonDates,
    pickDefaultDate,
    pickDefaultDayId,
} from '../../../../utils/programDaysView';

const bench = {
    id: 'bench', name: 'Bench Press', has_sets: true,
    metric_definitions: [{ id: 'w', name: 'Weight', unit: 'kg' }, { id: 'r', name: 'Reps', unit: 'reps' }],
};
const blocks = [{
    id: 'block-1', name: 'Hypertrophy', start_date: '2026-09-01', end_date: '2026-10-31',
    days: [
        { id: 'upper', name: 'Upper A', templates: [{ id: 'tmpl', name: 'Bench Day' }] },
        { id: 'rest', name: 'Rest', templates: [] },
    ],
}];

function planEntry(overrides = {}) {
    return {
        template: { id: 'tmpl', name: 'Bench Day', color: '#336699', revision: 1 },
        is_required: true,
        date: '2026-10-05',
        plan_id: null,
        row_version: null,
        source: 'previous_plan',
        seeded_from_date: '2026-09-28',
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

/** The page's Days tab: the side-pane navigator (with date rails) beside the main columns. */
function Harness({ timezone = 'UTC', showDateControls = false }) {
    const tab = useProgramDaysTab({
        rootId: 'root',
        programId: 'program',
        blocks,
        today: '2026-10-01',
        timezone,
        enabled: true,
        setViewMode: () => {},
        onLeavePane: () => {},
    });
    return (
        <>
            <aside aria-label="Program side pane">{tab.navigator}</aside>
            <ProgramDaysView
                rootId="root"
                program={{ id: 'program' }}
                blocks={blocks}
                activities={[bench]}
                activityGroups={[]}
                today="2026-10-01"
                timezone={timezone}
                resolved={tab.resolved}
                occurrencesQuery={tab.occurrencesQuery}
                focusTemplateId={tab.selection?.templateId || null}
                onSelectionChange={tab.setSelection}
                showDateControls={showDateControls}
            />
        </>
    );
}

function renderView(props = {}) {
    return renderViewWithClient(props);
}

function renderViewWithClient({ compare = false, ...props } = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    testingLibraryRender(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <Harness {...props} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    if (compare) fireEvent.click(within(pane()).getByRole('checkbox', { name: 'Compare two days' }));
    return { queryClient };
}

const pane = () => screen.getByRole('complementary', { name: 'Program side pane' });

const WEEK_ONE = planEntry({
    date: '2026-09-28', plan_id: 'p0', row_version: 1, source: 'plan', seeded_from_date: null, previous: null,
});

function plansFor(overridesByDate = {}) {
    return (_root, _program, _day, date) => Promise.resolve({ data: { date, plans: [
        overridesByDate[date] || (date === '2026-09-28' ? WEEK_ONE : planEntry()),
    ] } });
}

const nextCard = () => screen.findByRole('article', { name: 'Bench Day plan, Mon, Oct 5' });

beforeEach(() => {
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
});

describe('Days view date selection', () => {
    it('defaults to the latest program day beside the next one', () => {
        expect(pickDefaultDayId(blocks, '2026-10-01')).toBe('upper');
        const dates = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'];
        expect(pickDefaultDate(dates, '2026-10-01')).toBe('2026-10-05');
        const asOccurrences = (values) => values.map((date) => ({ date, templates: [], closed: true }));
        expect(pickComparisonDates(asOccurrences(dates), '2026-10-05')).toEqual(['2026-09-28', '2026-10-05']);
        // A program day today is the latest one; the next follows it.
        expect(pickDefaultDate(dates, '2026-10-05')).toBe('2026-10-12');
        // After the last date, compare the last two; before the first, show the first alone.
        expect(pickDefaultDate(dates, '2026-11-01')).toBe('2026-10-12');
        expect(pickComparisonDates(asOccurrences(dates), pickDefaultDate(dates, '2026-09-01'))).toEqual(['2026-09-21']);
        expect(pickDefaultDate([], '2026-10-01')).toBeNull();
    });

    it('captions columns only as latest or next when they are', () => {
        const dates = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'];
        expect(describeOccurrenceDate('2026-09-28', dates, '2026-10-01')).toBe('Latest');
        expect(describeOccurrenceDate('2026-09-21', dates, '2026-10-01')).toBe('Past');
        expect(describeOccurrenceDate('2026-10-05', dates, '2026-10-01')).toBe('Next');
        expect(describeOccurrenceDate('2026-10-12', dates, '2026-10-01')).toBe('Upcoming');
        expect(describeOccurrenceDate('2026-10-05', dates, '2026-10-05')).toBe('Today');
    });
});

describe('ProgramDaysView', () => {
    it('shows one program day by default and adds a comparison from the side pane', async () => {
        renderView();

        expect(await screen.findByRole('region', { name: 'Monday, Oct 5' })).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Monday, Sep 28' })).not.toBeInTheDocument();
        const rail = screen.getByRole('list', { name: 'Program day dates' });
        expect(within(rail).queryByRole('button', { name: /shown in the other column/ })).not.toBeInTheDocument();

        const toggle = within(pane()).getByRole('checkbox', { name: 'Compare two days' });
        expect(toggle).not.toBeChecked();
        fireEvent.click(toggle);

        expect(await screen.findByRole('region', { name: 'Monday, Sep 28' })).toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Left column dates' })).toBeInTheDocument();

        fireEvent.click(toggle);
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Monday, Sep 28' })).not.toBeInTheDocument());
    });

    it('shows the latest and next program days side by side', async () => {
        renderView({ compare: true });

        const latest = await screen.findByRole('region', { name: 'Monday, Sep 28' });
        const next = screen.getByRole('region', { name: 'Monday, Oct 5' });
        expect(within(latest).getByText('Last completed')).toBeInTheDocument();
        expect(within(latest).getByText('Completed')).toBeInTheDocument();
        expect(within(latest).getByRole('link', { name: 'Bench Day' })).toHaveAttribute('href', '/root/session/sess-1');
        expect(within(next).getByText('Next')).toBeInTheDocument();
        expect(within(next).getByText('Scheduled')).toBeInTheDocument();
        expect(api.getProgramDayPlans).toHaveBeenCalledWith('root', 'program', 'upper', '2026-09-28', 'UTC');
        expect(api.getProgramDayPlans).toHaveBeenCalledWith('root', 'program', 'upper', '2026-10-05', 'UTC');
    });

    it('seeds the next day from the latest plan, with its values as placeholders', async () => {
        renderView();

        const card = await nextCard();
        expect(within(card).getByText('Starts from Mon, Sep 28')).toBeInTheDocument();
        expect(within(card).getByLabelText('Set 1 planned Weight')).toHaveAttribute('placeholder', '100');
        expect(screen.queryByText('Rest')).not.toBeInTheDocument();
    });

    it('saves an edited value with the whole plan and no row version for a seed', async () => {
        api.saveProgramSessionPlan.mockResolvedValue({ data: planEntry({ plan_id: 'p1', row_version: 1, source: 'plan' }) });
        renderView();

        const card = await nextCard();
        const weight = within(card).getByLabelText('Set 1 planned Weight');
        fireEvent.change(weight, { target: { value: '105' } });
        fireEvent.blur(weight);
        fireEvent.click(within(card).getByRole('button', { name: 'Save plan' }));

        await waitFor(() => expect(api.saveProgramSessionPlan).toHaveBeenCalled());
        const [, , , templateId, date, body] = api.saveProgramSessionPlan.mock.calls[0];
        expect([templateId, date]).toEqual(['tmpl', '2026-10-05']);
        expect(body.row_version).toBeUndefined();
        expect(api.saveProgramSessionPlan.mock.calls[0][6]).toBe('UTC');
        expect(body.sections[0].items[0].prescription.sets[0].metrics).toEqual([
            { metric_id: 'w', split_id: null, value: 105 },
        ]);
    });

    it('refreshes an untouched seed when the plan it starts from changes', async () => {
        const { queryClient } = renderViewWithClient();
        const card = await nextCard();
        expect(within(card).getByLabelText('Set 1 planned Weight')).toHaveValue('100');

        const bumped = planEntry({ sections: [{ name: 'Main', items: [{
            type: 'activity', activity_definition_id: 'bench', name: 'Bench Press', item_key: 'k1',
            prescription: { schema: 1, sets: [{ metrics: [{ metric_id: 'w', split_id: null, value: 110 }] }] },
        }] }] });
        api.getProgramDayPlans.mockImplementation(plansFor({ '2026-10-05': bumped }));
        await queryClient.invalidateQueries();

        await waitFor(async () => expect(within(await nextCard()).getByLabelText('Set 1 planned Weight')).toHaveValue('110'));
    });

    it('explains a conflicting save and offers a reload', async () => {
        api.saveProgramSessionPlan.mockRejectedValue({ response: { status: 409, data: { error: 'changed' } } });
        renderView();

        const card = await nextCard();
        fireEvent.click(within(card).getByRole('button', { name: 'Save plan' }));

        expect(await within(card).findByRole('alert')).toHaveTextContent('This plan changed somewhere else');
        expect(within(card).getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    });

    it('offers pulling template changes when the template moved on', async () => {
        api.getProgramDayPlans.mockImplementation(plansFor({
            '2026-10-05': planEntry({ plan_id: 'p1', row_version: 3, source: 'plan', template_changed: true }),
        }));
        api.pullProgramSessionPlanTemplate.mockResolvedValue({ data: planEntry({ plan_id: 'p1', row_version: 4, source: 'plan' }) });
        renderView();

        fireEvent.click(await screen.findByRole('button', { name: 'Pull changes' }));

        await waitFor(() => expect(api.pullProgramSessionPlanTemplate).toHaveBeenCalledWith(
            'root', 'program', 'upper', 'tmpl', '2026-10-05', { row_version: 3 }, 'UTC',
        ));
    });

    it('gives each column its own date rail and picks the two dates independently', async () => {
        renderView({ compare: true });
        const left = await screen.findByRole('list', { name: 'Left column dates' });
        const right = screen.getByRole('list', { name: 'Right column dates' });
        // Each rail marks its own date and blocks the one the other column shows.
        expect(within(left).getByRole('button', { name: /Monday, .*completed/ })).toHaveAttribute('aria-pressed', 'true');
        expect(within(left).getByRole('button', { name: /shown in the other column/ })).toHaveAttribute('aria-pressed', 'false');
        expect(within(right).getByRole('button', { name: /Monday, .*scheduled/ })).toHaveAttribute('aria-pressed', 'true');
        expect(within(pane()).queryByRole('list', { name: /dates/ })).not.toBeInTheDocument();

        // Picking the date the other column shows swaps the two columns.
        fireEvent.click(within(right).getByRole('button', { name: /shown in the other column/ }));

        await waitFor(() => expect(within(screen.getByRole('list', { name: 'Right column dates' }))
            .getByRole('button', { name: /Monday, .*completed/ })).toHaveAttribute('aria-pressed', 'true'));
        expect(within(screen.getByRole('list', { name: 'Left column dates' }))
            .getByRole('button', { name: /Monday, .*scheduled/ })).toHaveAttribute('aria-pressed', 'true');
        expect(await screen.findByRole('region', { name: 'Monday, Sep 28' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Monday, Oct 5' })).toBeInTheDocument();
    });

    it('marks each date with the canonical day status and asks for the local timezone', async () => {
        renderView({ timezone: 'America/New_York' });

        const right = await screen.findByRole('list', { name: 'Program day dates' });
        const completed = within(right).getByRole('button', { name: /Monday, .*completed, planned/ });
        expect(completed.querySelector('[data-program-day-status="complete"]')).not.toBeNull();
        expect(within(right).getByRole('button', { name: /scheduled, not planned yet/ })
            .querySelector('[data-program-day-status="scheduled"]')).not.toBeNull();
        expect(api.getProgramPlanOccurrences).toHaveBeenCalledWith('root', 'program', { timezone: 'America/New_York' });
    });

    it('plans circuit rounds and values, and never shows circuits as deleted activities', async () => {
        api.saveProgramSessionPlan.mockResolvedValue({ data: planEntry({ plan_id: 'p1', row_version: 1, source: 'plan' }) });
        api.getProgramDayPlans.mockImplementation(plansFor({ '2026-10-05': planEntry({
            sections: [{ name: 'Main', items: [
                { type: 'circuit', circuit_definition_id: 'circ', item_key: 'legacy-0-0' },
                { type: 'activity', activity_id: 'bench', name: 'Bench Press', item_key: 'legacy-0-1' },
            ] }],
        }) }));
        renderView();

        const card = await nextCard();
        expect(within(card).getByText('Core Finisher')).toBeInTheDocument();
        expect(screen.queryByText(/was deleted/)).not.toBeInTheDocument();

        fireEvent.click(within(card).getByRole('button', { name: '+ Add round' }));
        const weight = within(card).getByLabelText('Round 1 Bench Press planned Weight');
        fireEvent.change(weight, { target: { value: '40' } });
        fireEvent.blur(weight);
        fireEvent.click(within(card).getByRole('button', { name: '+ Add round' }));
        expect(within(card).getByLabelText('Round 2 Bench Press planned Weight')).toHaveValue('40');
        fireEvent.click(within(card).getByRole('button', { name: 'Save plan' }));

        await waitFor(() => expect(api.saveProgramSessionPlan).toHaveBeenCalled());
        const body = api.saveProgramSessionPlan.mock.calls[0][5];
        expect(body.sections[0].items[0].prescription).toEqual({ schema: 1, rounds: [
            { slots: [{ slot_id: 's1', metrics: [{ metric_id: 'w', split_id: null, value: 40 }] }], notes: null },
            { slots: [{ slot_id: 's1', metrics: [{ metric_id: 'w', split_id: null, value: 40 }] }], notes: null },
        ] });
    });

    it('shows a past day\'s planned circuit rounds read-only', async () => {
        api.getProgramDayPlans.mockImplementation(plansFor({ '2026-09-28': {
            ...WEEK_ONE,
            sections: [{ name: 'Main', items: [{
                type: 'circuit', circuit_definition_id: 'circ', item_key: 'c',
                prescription: { schema: 1, rounds: [
                    { slots: [{ slot_id: 's1', metrics: [{ metric_id: 'w', split_id: null, value: 40 }] }], notes: null },
                    { slots: [], notes: null },
                ] },
            }] }],
        } }));
        renderView({ compare: true });

        const past = await screen.findByRole('article', { name: 'Bench Day plan, Mon, Sep 28' });
        // The editor's round fields, read-only.
        const rounds = within(past).getByRole('group', { name: 'Planned rounds' });
        const weight = within(rounds).getByLabelText('Round 1 Bench Press planned Weight');
        expect(weight).toHaveValue('40');
        expect(weight).toHaveAttribute('readonly');
        expect(within(rounds).getByText('Round 2')).toBeInTheDocument();
        expect(within(past).queryByRole('button', { name: '+ Add round' })).not.toBeInTheDocument();
        expect(within(past).queryByRole('button', { name: /Remove planned round/ })).not.toBeInTheDocument();
    });

    it('offers a day select in the main area on narrow screens', async () => {
        renderView({ showDateControls: true });

        expect(await screen.findByLabelText('Program day')).toHaveValue('upper');
        expect(await screen.findByRole('list', { name: 'Program day dates' })).toBeInTheDocument();
    });

    it('compares against the latest completed day, skipping a missed one', async () => {
        api.getProgramPlanOccurrences.mockResolvedValue({ data: { program_id: 'program', days: [{ day_id: 'upper', dates: [
            {
                date: '2026-09-21', templates: [{ template_id: 'tmpl', state: 'seeded', plan_id: null }],
                state: 'scheduled_met', manual_status: null, closed: true, program_day_completed: true, sessions: [],
            },
            {
                date: '2026-09-28', templates: [{ template_id: 'tmpl', state: 'seeded', plan_id: null }],
                state: 'scheduled_missed', manual_status: null, closed: true, program_day_completed: false, sessions: [],
            },
            {
                date: '2026-10-05', templates: [{ template_id: 'tmpl', state: 'seeded', plan_id: null }],
                state: 'scheduled_pending', manual_status: null, closed: false, program_day_completed: false, sessions: [],
            },
        ] }] } });
        renderView({ compare: true });

        const completed = await screen.findByRole('region', { name: 'Monday, Sep 21' });
        expect(within(completed).getByText('Last completed')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Monday, Sep 28' })).not.toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Monday, Oct 5' })).toBeInTheDocument();
    });

    it('shows no plans for a past program day without sessions', async () => {
        api.getProgramPlanOccurrences.mockResolvedValue({ data: { program_id: 'program', days: [{ day_id: 'upper', dates: [
            {
                date: '2026-09-28', templates: [{ template_id: 'tmpl', state: 'seeded', plan_id: null }],
                state: 'scheduled_missed', manual_status: null, closed: true, program_day_completed: false, sessions: [],
            },
            {
                date: '2026-10-05', templates: [{ template_id: 'tmpl', state: 'seeded', plan_id: null }],
                state: 'scheduled_pending', manual_status: null, closed: false, program_day_completed: false, sessions: [],
            },
        ] }] } });
        renderView({ compare: true });

        const missed = await screen.findByRole('region', { name: 'Monday, Sep 28' });
        expect(within(missed).getByText('No sessions logged')).toBeInTheDocument();
        // A card saying so, in place of the template plans.
        expect(within(missed).getByRole('article', { name: 'No sessions logged' })).toBeInTheDocument();
        expect(within(missed).queryByRole('article', { name: /plan/ })).not.toBeInTheDocument();
        expect(api.getProgramDayPlans).not.toHaveBeenCalledWith('root', 'program', 'upper', '2026-09-28', 'UTC');
        // The upcoming day still plans as usual.
        expect(await nextCard()).toBeInTheDocument();
    });

    it('shows a past program day read-only, without saving or editing controls', async () => {
        renderView({ compare: true });

        const past = await screen.findByRole('article', { name: 'Bench Day plan, Mon, Sep 28' });
        expect(within(past).getByText("Past program day · this plan can't be changed.")).toBeInTheDocument();
        // The same set fields as the editable day beside it, read-only.
        const planned = within(past).getByLabelText('Set 1 planned Weight');
        expect(planned).toHaveValue('100');
        expect(planned).toHaveAttribute('readonly');
        expect(within(past).queryByRole('button', { name: /Remove planned set/ })).not.toBeInTheDocument();
        expect(within(past).queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
        expect(within(past).queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
        expect(within(past).queryByRole('button', { name: '+ Add activity' })).not.toBeInTheDocument();
        expect(within(past).queryByRole('button', { name: '+ Add set' })).not.toBeInTheDocument();
        expect(within(past).queryByLabelText('Coaching note for Bench Press')).not.toBeInTheDocument();
        expect(within(past).queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();

        // The upcoming day beside it stays editable.
        const next = await nextCard();
        expect(within(next).getByRole('button', { name: 'Save plan' })).toBeInTheDocument();
    });


    it('shows a completed template as its session in the plan card layout', async () => {
        api.getSession.mockResolvedValue({ data: {
            id: 'sess-1', name: 'Bench Day', completed: true,
            attributes: { session_data: { sections: [{ name: 'Main', items: [
                { type: 'activity', activity_instance_id: 'i1', activity: {
                    instance_id: 'i1', activity_id: 'bench', name: 'Bench Press', metrics: [], notes: 'felt strong',
                    sets: [
                        { metrics: [{ metric_id: 'w', split_id: null, value: 102.5 }], notes: null },
                        { metrics: [{ metric_id: 'w', split_id: null, value: 100 }], notes: null },
                    ],
                } },
                { type: 'circuit', circuit_run_id: 'run', circuit: {
                    id: 'run', name: 'Core Finisher', circuit_definition_id: 'circ',
                    slots: [{ id: 'rs1', sort_order: 0, activity_definition_id: 'bench', activity_name: 'Bench Press' }],
                    rounds: [
                        { round_number: 1, members: [{ circuit_run_slot_id: 'rs1', metrics: [{ metric_id: 'w', split_id: null, value: 40 }] }] },
                        { round_number: 2, members: [{ circuit_run_slot_id: 'rs1', metrics: [] }] },
                    ],
                } },
            ] }] } },
        } });
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
        api.getProgramDayPlans.mockImplementation(plansFor({ '2026-09-28': {
            ...WEEK_ONE,
            logged_sessions: [{ id: 'sess-1', name: 'Bench Day', completed: true }],
        } }));
        renderView({ compare: true });

        const session = await screen.findByRole('article', { name: 'Bench Day session' });
        expect(api.getSession).toHaveBeenCalledWith('root', 'sess-1');
        // The plan card layout: the session's sections, each activity's logged sets, circuit rounds.
        expect(within(session).getByRole('heading', { name: 'Main' })).toBeInTheDocument();
        // Logged values sit in the plan editor's fields, read-only, so they compare field for field.
        const logged = within(session).getByRole('group', { name: 'Logged sets' });
        expect(within(logged).getByLabelText('Set 1 logged Weight')).toHaveValue('102.5');
        expect(within(logged).getByLabelText('Set 1 logged Weight')).toHaveAttribute('readonly');
        expect(within(session).getByText('felt strong')).toBeInTheDocument();
        const rounds = within(session).getByRole('group', { name: 'Logged rounds' });
        expect(within(rounds).getByLabelText('Round 1 Bench Press logged Weight')).toHaveValue('40');
        expect(within(rounds).getByText('Round 2')).toBeInTheDocument();
        expect(within(session).queryByRole('button', { name: /Remove|Add/ })).not.toBeInTheDocument();
        expect(within(session).getByRole('link', { name: 'Completed · Open session' })).toHaveAttribute('href', '/root/session/sess-1');
        expect(session.querySelector('[data-align-key="tmpl|a:bench#0"]')).not.toBeNull();
        expect(session.querySelector('[data-align-key="tmpl|c:circ#0"]')).not.toBeNull();
        expect(screen.queryByRole('article', { name: 'Bench Day plan, Mon, Sep 28' })).not.toBeInTheDocument();
        expect(await nextCard()).toBeInTheDocument();
    });
});
