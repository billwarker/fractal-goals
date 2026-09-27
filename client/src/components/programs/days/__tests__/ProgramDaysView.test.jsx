import React from 'react';
import { fireEvent, render as testingLibraryRender, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = {
    getProgramDayPlanOccurrences: vi.fn(),
    getProgramDayPlans: vi.fn(),
    saveProgramSessionPlan: vi.fn(),
    resetProgramSessionPlan: vi.fn(),
    pullProgramSessionPlanTemplate: vi.fn(),
};
vi.mock('../../../../utils/api', () => ({ fractalApi: new Proxy({}, { get: (_, key) => api[key] }) }));
vi.mock('../../../../hooks/useCircuitQueries', () => ({ useCircuits: () => ({ data: [] }) }));

import ProgramDaysView, { pickDefaultDate, pickDefaultDayId } from '../ProgramDaysView';

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

function renderView(props = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const onSelectionChange = vi.fn();
    testingLibraryRender(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <ProgramDaysView
                    rootId="root"
                    program={{ id: 'program' }}
                    blocks={blocks}
                    activities={[bench]}
                    activityGroups={[]}
                    today="2026-10-01"
                    selection={null}
                    onSelectionChange={onSelectionChange}
                    {...props}
                />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { onSelectionChange };
}

beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getProgramDayPlanOccurrences.mockResolvedValue({ data: { day_id: 'upper', dates: [
        { date: '2026-09-28', templates: [{ template_id: 'tmpl', state: 'planned', plan_id: 'p0' }] },
        { date: '2026-10-05', templates: [{ template_id: 'tmpl', state: 'seeded', plan_id: null }] },
    ] } });
    api.getProgramDayPlans.mockResolvedValue({ data: { date: '2026-10-05', plans: [planEntry()] } });
});

describe('ProgramDaysView defaults', () => {
    it('picks the first plannable day in the current block and the next upcoming date', () => {
        expect(pickDefaultDayId(blocks, '2026-10-01')).toBe('upper');
        expect(pickDefaultDate(['2026-09-28', '2026-10-05'], '2026-10-01')).toBe('2026-10-05');
        expect(pickDefaultDate(['2026-09-28'], '2026-10-01')).toBe('2026-09-28');
        expect(pickDefaultDate([], '2026-10-01')).toBeNull();
    });
});

describe('ProgramDaysView', () => {
    it('shows the seeded plan for the next date with the previous plan as placeholders', async () => {
        renderView();

        expect(await screen.findByText('Starts from Mon, Sep 28')).toBeInTheDocument();
        expect(api.getProgramDayPlans).toHaveBeenCalledWith('root', 'program', 'upper', '2026-10-05');
        const weight = screen.getByLabelText('Set 1 planned Weight');
        expect(weight).toHaveAttribute('placeholder', '100');
        expect(screen.queryByText('Rest')).not.toBeInTheDocument();
    });

    it('saves an edited value with the whole plan and no row version for a seed', async () => {
        api.saveProgramSessionPlan.mockResolvedValue({ data: planEntry({ plan_id: 'p1', row_version: 1, source: 'plan' }) });
        renderView();

        const weight = await screen.findByLabelText('Set 1 planned Weight');
        fireEvent.change(weight, { target: { value: '105' } });
        fireEvent.blur(weight);
        fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));

        await waitFor(() => expect(api.saveProgramSessionPlan).toHaveBeenCalled());
        const [, , , templateId, date, body] = api.saveProgramSessionPlan.mock.calls[0];
        expect([templateId, date]).toEqual(['tmpl', '2026-10-05']);
        expect(body.row_version).toBeUndefined();
        expect(body.sections[0].items[0].prescription.sets[0].metrics).toEqual([
            { metric_id: 'w', split_id: null, value: 105 },
        ]);
    });

    it('explains a conflicting save and offers a reload', async () => {
        api.saveProgramSessionPlan.mockRejectedValue({ response: { status: 409, data: { error: 'changed' } } });
        renderView();

        fireEvent.click(await screen.findByRole('button', { name: 'Save plan' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('This plan changed somewhere else');
        expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    });

    it('offers pulling template changes when the template moved on', async () => {
        api.getProgramDayPlans.mockResolvedValue({ data: { date: '2026-10-05', plans: [
            planEntry({ plan_id: 'p1', row_version: 3, source: 'plan', template_changed: true }),
        ] } });
        api.pullProgramSessionPlanTemplate.mockResolvedValue({ data: planEntry({ plan_id: 'p1', row_version: 4, source: 'plan' }) });
        renderView();

        fireEvent.click(await screen.findByRole('button', { name: 'Pull changes' }));

        await waitFor(() => expect(api.pullProgramSessionPlanTemplate).toHaveBeenCalledWith(
            'root', 'program', 'upper', 'tmpl', '2026-10-05', { row_version: 3 },
        ));
    });

    it('moves to another date through the strip', async () => {
        const { onSelectionChange } = renderView();

        fireEvent.click(await screen.findByRole('button', { name: 'Previous date' }));

        expect(onSelectionChange).toHaveBeenCalledWith({ dayId: 'upper', date: '2026-09-28' });
    });
});
