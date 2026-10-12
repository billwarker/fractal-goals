import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WEEK_ONE, planEntry, programDaysApi as api, resetProgramDaysApi } from '../../../../test/programs/programDaysFixtures';
import { nextCard, renderView } from '../../../../test/programs/renderProgramDaysView';

vi.mock('../../../../utils/api', () => import('../../../../test/programs/programDaysFixtures'));
vi.mock('../../../../contexts/GoalLevelsContext', () => ({ useGoalLevels: () => ({ getGoalColor: () => '#336699' }) }));
vi.mock('../../../../hooks/useCircuitQueries', () => ({
    useCircuits: () => ({ data: [{
        id: 'circ', name: 'Core Finisher',
        slots: [{ id: 's1', activity_definition_id: 'bench', activity: { name: 'Hollow Hold' } }],
    }] }),
    useCircuitDefinitionMutations: () => ({ createMutation: { mutateAsync: vi.fn(), isPending: false } }),
}));

beforeEach(resetProgramDaysApi);

describe('Block and week buckets', () => {
    const occurrence = (date, state = 'scheduled_pending') => ({
        date, templates: [{ template_id: 'tmpl', state: 'seeded', plan_id: null }],
        state, manual_status: null, closed: state !== 'scheduled_pending',
        program_day_completed: state === 'scheduled_met', sessions: [],
    });

    beforeEach(() => {
        // Mon/Thu in weeks 5 and 6, nothing in week 7, then week 8.
        api.getProgramPlanOccurrences.mockResolvedValue({ data: { program_id: 'program', days: [{ day_id: 'upper', dates: [
            occurrence('2026-09-28', 'scheduled_met'), occurrence('2026-10-01', 'scheduled_met'),
            occurrence('2026-10-05'), occurrence('2026-10-08'),
            occurrence('2026-10-19'), occurrence('2026-10-22'),
        ] }] } });
    });

    const weeks = () => screen.getByRole('group', { name: 'Program day dates: weeks of Hypertrophy' });
    const railDates = () => within(screen.getByRole('list', { name: 'Program day dates' })).getAllByRole('button');

    it('keeps every date on the rail and marks the selected date\'s block and week', async () => {
        renderView();

        await screen.findByRole('region', { name: 'Monday, Oct 5' });
        expect(railDates()).toHaveLength(6);
        expect(within(weeks()).getAllByRole('button')).toHaveLength(9);
        expect(within(weeks()).getByRole('button', { name: /^Week 6,/ })).toHaveAttribute('aria-pressed', 'true');
        expect(within(weeks()).getByRole('button', { name: /^Week 5,.*2 dates, 2 done/ })).toBeInTheDocument();
    });

    it('jumps to the start of a picked week, and ignores weeks without dates', async () => {
        renderView();
        await screen.findByRole('region', { name: 'Monday, Oct 5' });

        const empty = within(weeks()).getByRole('button', { name: /^Week 7,.*no dates for this day/ });
        expect(empty).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(empty);
        expect(screen.getByRole('region', { name: 'Monday, Oct 5' })).toBeInTheDocument();

        fireEvent.click(within(weeks()).getByRole('button', { name: /^Week 8,/ }));
        expect(await screen.findByRole('region', { name: 'Monday, Oct 19' })).toBeInTheDocument();

        // Mid-week, picking the current week returns to its first date.
        fireEvent.click(screen.getByRole('button', { name: 'Program day dates: next date' }));
        expect(await screen.findByRole('region', { name: 'Thursday, Oct 22' })).toBeInTheDocument();
        fireEvent.click(within(weeks()).getByRole('button', { name: /^Week 8,/ }));
        expect(await screen.findByRole('region', { name: 'Monday, Oct 19' })).toBeInTheDocument();
    });

    it('jumps to the start of a picked block', async () => {
        renderView();
        await screen.findByRole('region', { name: 'Monday, Oct 5' });

        fireEvent.click(screen.getByRole('button', { name: /^Hypertrophy,/ }));
        expect(await screen.findByRole('region', { name: 'Monday, Sep 28' })).toBeInTheDocument();
        expect(within(weeks()).getByRole('button', { name: /^Week 5,/ })).toHaveAttribute('aria-pressed', 'true');
    });
});

describe('Optional session templates', () => {
    const accessories = (overrides = {}) => planEntry({
        template: { id: 'acc', name: 'Accessories', color: '#aa5500', revision: 1 },
        is_required: false,
        is_loaded: false,
        source: 'template',
        seeded_from_date: null,
        previous: null,
        sections: [{ name: 'Main', items: [
            { type: 'activity', activity_definition_id: 'bench', name: 'Curls', item_key: 'c1' },
            { type: 'activity', activity_definition_id: 'bench', name: 'Rows', item_key: 'c2' },
        ] }],
        ...overrides,
    });
    const withOptional = (optional) => (_root, _program, _day, date) => Promise.resolve({ data: { date, plans: [
        date === '2026-09-28' ? WEEK_ONE : planEntry({ is_loaded: true }),
        { ...optional, date },
    ] } });
    const selector = () => screen.findByRole('region', { name: 'Optional sessions' });

    it('opens required templates and lists optional ones in a selector', async () => {
        api.getProgramDayPlans.mockImplementation(withOptional(accessories()));
        renderView();

        expect(await nextCard()).toBeInTheDocument();
        const list = await selector();
        expect(within(list).getByText('Accessories')).toBeInTheDocument();
        expect(within(list).getByText('2 activities')).toBeInTheDocument();
        expect(screen.queryByRole('article', { name: 'Accessories plan, Mon, Oct 5' })).not.toBeInTheDocument();
    });

    it('adds an optional template to the day as an editable plan card', async () => {
        api.getProgramDayPlans.mockImplementation(withOptional(accessories()));
        api.loadProgramSessionPlan.mockResolvedValue({ data: accessories({
            date: '2026-10-05', is_loaded: true, plan_id: 'pa', row_version: 1, source: 'plan',
        }) });
        renderView();

        fireEvent.click(within(await selector()).getByRole('button', { name: 'Add Accessories to this day' }));

        const card = await screen.findByRole('article', { name: 'Accessories plan, Mon, Oct 5' });
        expect(api.loadProgramSessionPlan).toHaveBeenCalledWith('root', 'program', 'upper', 'acc', '2026-10-05', 'UTC');
        expect(within(card).getByText('Optional')).toBeInTheDocument();
        expect(within(card).getByRole('button', { name: 'Remove from day' })).toBeInTheDocument();
        await waitFor(() => expect(card).toHaveFocus());
        expect(screen.queryByRole('region', { name: 'Optional sessions' })).not.toBeInTheDocument();
    });

    it('removes a loaded optional template back into the selector', async () => {
        api.getProgramDayPlans.mockImplementation(withOptional(accessories({
            is_loaded: true, plan_id: 'pa', row_version: 1, source: 'plan',
        })));
        api.resetProgramSessionPlan.mockResolvedValue({ data: accessories({ date: '2026-10-05' }) });
        renderView();

        const card = await screen.findByRole('article', { name: 'Accessories plan, Mon, Oct 5' });
        fireEvent.click(within(card).getByRole('button', { name: 'Remove from day' }));

        const list = await selector();
        expect(api.resetProgramSessionPlan).toHaveBeenCalledWith('root', 'program', 'upper', 'acc', '2026-10-05', 'UTC');
        expect(within(list).getByText('Accessories')).toBeInTheDocument();
    });

    it('shows no selector on a past program day', async () => {
        api.getProgramDayPlans.mockImplementation(withOptional(accessories()));
        renderView({ compare: true });

        expect(await screen.findByRole('article', { name: 'Bench Day plan, Mon, Sep 28' })).toBeInTheDocument();
        await waitFor(() => expect(screen.getAllByRole('region', { name: 'Optional sessions' })).toHaveLength(1));
    });
});
