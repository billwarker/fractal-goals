import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProgramDayPane from '../ProgramDayPane';

const detail = {
    requirements: {
        requirements_met: false,
        completed_template_ids: [],
        required_template_ids: ['template-1'],
        completion_min_templates: 1,
    },
    occurrences: [{
        occurrence_key: 'day-1:2026-09-02',
        program_day_id: 'day-1',
        block: { id: 'block-1', name: 'Foundation', color: '#c05a24' },
        name: 'Strength day',
        definition_note: 'Keep two reps in reserve.',
        goal_ids: ['goal-1'],
        requirements: {
            requirements_met: false,
            completed_template_ids: [],
            required_template_ids: ['template-1'],
            completion_min_templates: null,
        },
        templates: [{
            id: 'template-1', name: 'Main work', color: '#336699', status: 'pending',
        }],
        credits: [],
    }],
    can_edit_credits: false,
    sessions: [],
};

function reviewSession(overrides = {}) {
    return {
        id: 'session-1',
        name: 'Planche Focus',
        template_id: 'template-1',
        template: { id: 'template-1', name: 'Planche Focus', color: '#336699' },
        session_start: '2026-09-01T14:00:00Z',
        session_end: '2026-09-01T14:30:00Z',
        total_duration_seconds: 1800,
        completed: true,
        is_paused: false,
        relation: 'off_plan',
        credit: null,
        excluded: false,
        alignment: { aligned_ratio: 0.5, basis: 'duration', activity_count: 2, aligned_seconds: 900, total_seconds: 1800 },
        credit_options: [],
        ...overrides,
    };
}

function renderPane(overrides = {}) {
    const props = {
        rootId: 'root-1',
        date: '2026-09-02',
        today: '2026-09-02',
        summary: { state: 'scheduled_pending' },
        query: { data: { detail } },
        program: { id: 'program-1', name: 'Program' },
        goals: [{ id: 'goal-1', name: 'Build strength', type: 'ShortTermGoal' }],
        getGoalIcon: () => 'circle',
        getGoalColor: () => '#336699',
        onGoalClick: vi.fn(),
        ...overrides,
    };
    render(<MemoryRouter><ProgramDayPane {...props} /></MemoryRouter>);
    return props;
}

describe('ProgramDayPane day review', () => {
    it('reviews a past unscheduled date with its sessions instead of planning actions', () => {
        renderPane({
            date: '2026-09-01',
            query: { data: { detail: {
                occurrences: [],
                scheduled: false,
                can_edit_credits: false,
                sessions: [reviewSession()],
            } } },
            blocks: [{ id: 'block-1', name: 'Foundation', days: [{ id: 'reusable', name: 'Reusable', date: null }] }],
        });

        expect(screen.queryByRole('heading', { name: 'Plan this day' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Day summary' })).not.toBeInTheDocument();
        const sessionsCard = screen.getByRole('heading', { name: 'Sessions' }).closest('section');
        expect(within(sessionsCard).getByRole('img', { name: '50% of activity time aligned to program goals' })).toBeInTheDocument();
        expect(screen.queryByText(/don’t count toward this day/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Count as/ })).not.toBeInTheDocument();
    });

    it('reports an empty past day without planning actions', () => {
        renderPane({
            date: '2026-09-01',
            query: { data: { detail: { occurrences: [], scheduled: false, sessions: [] } } },
            blocks: [{ id: 'block-1', name: 'Foundation', days: [] }],
        });

        expect(screen.getByText('No sessions logged on this day.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New day in Foundation' })).not.toBeInTheDocument();
    });

    it('offers planning without an empty-history message for today and future dates', () => {
        for (const date of ['2026-09-02', '2026-09-05']) {
            const { unmount } = render(
                <MemoryRouter>
                    <ProgramDayPane
                        rootId="root-1"
                        date={date}
                        today="2026-09-02"
                        query={{ data: { detail: { occurrences: [], scheduled: false, sessions: [] } } }}
                        program={{ id: 'program-1' }}
                        blocks={[{ id: 'block-1', name: 'Foundation', days: [] }]}
                    />
                </MemoryRouter>,
            );
            expect(screen.getByRole('button', { name: 'New day in Foundation' })).toBeInTheDocument();
            expect(screen.queryByText('No sessions logged on this day.')).not.toBeInTheDocument();
            unmount();
        }
    });

    it('lists credited sessions on a missed day and separates off-plan work with a one-click credit', async () => {
        const onSetSessionCredit = vi.fn().mockResolvedValue(true);
        const credited = reviewSession({
            id: 'credited', name: 'Planche Focus', relation: 'credited',
            credit: { source: 'template_match', template_id: 'template-1' },
        });
        const offPlan = reviewSession({
            id: 'off-plan', name: 'Run', template: { id: 'run', name: 'Run', color: '#669933' },
            credit_options: [{ template_id: 'template-2', name: 'Handstand', color: '#993366' }],
        });
        renderPane({
            date: '2026-09-01',
            onSetSessionCredit,
            query: { data: { detail: {
                ...detail,
                scheduled: true,
                state: 'scheduled_partial',
                can_edit_credits: true,
                occurrences: [{
                    ...detail.occurrences[0],
                    credits: [{ session_id: 'credited', template_id: 'template-1', source: 'template_match' }],
                }],
                sessions: [credited, offPlan],
            } } },
        });

        const dayCard = screen.getByRole('heading', { name: 'Strength day' }).closest('section');
        const countedList = within(dayCard).getByLabelText('Sessions counted toward Strength day');
        expect(within(countedList).getByText('Matched template')).toBeInTheDocument();
        expect(within(countedList).getByRole('img', { name: '50% of activity time aligned to program goals' })).toBeInTheDocument();
        const offPlanCard = within(dayCard).getByRole('group', { name: 'Off-plan sessions' });
        expect(screen.getAllByRole('heading', { name: 'Off-plan sessions' })).toHaveLength(1);
        expect(within(offPlanCard).getByText(/don’t count toward this day/)).toBeInTheDocument();
        expect(within(offPlanCard).queryByText('Planche Focus')).not.toBeInTheDocument();
        fireEvent.click(within(offPlanCard).getByRole('button', { name: 'Count as Handstand' }));
        await waitFor(() => expect(onSetSessionCredit).toHaveBeenCalledWith(offPlan, 'credit', 'template-2'));
    });

    it('offers exclusion for automatic credit and restoration for manual credit through the row menu', async () => {
        const onSetSessionCredit = vi.fn().mockResolvedValue(true);
        const automatic = reviewSession({
            id: 'auto', name: 'Auto session', relation: 'credited',
            credit: { source: 'template_match', template_id: 'template-1' },
        });
        const manual = reviewSession({
            id: 'manual', name: 'Manual session', relation: 'credited',
            credit: { source: 'manual', template_id: 'template-1' },
        });
        renderPane({
            date: '2026-09-01',
            onSetSessionCredit,
            query: { data: { detail: {
                ...detail,
                scheduled: true,
                can_edit_credits: true,
                occurrences: [{
                    ...detail.occurrences[0],
                    credits: [
                        { session_id: 'auto', template_id: 'template-1', source: 'template_match' },
                        { session_id: 'manual', template_id: 'template-1', source: 'manual' },
                    ],
                }],
                sessions: [automatic, manual],
            } } },
        });

        const trigger = screen.getByRole('button', { name: 'Change how Auto session counts toward this day' });
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Don’t count toward this day' }));
        await waitFor(() => expect(onSetSessionCredit).toHaveBeenCalledWith(automatic, 'exclude', undefined));
        await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));

        fireEvent.click(screen.getByRole('button', { name: 'Change how Manual session counts toward this day' }));
        expect(screen.getByText('Counted manually')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Use automatic credit' }));
        await waitFor(() => expect(onSetSessionCredit).toHaveBeenCalledWith(manual, 'automatic', undefined));
    });

    it('labels excluded and other-program sessions and disables credit actions while pending', () => {
        renderPane({
            date: '2026-09-01',
            sessionCreditUpdating: true,
            query: { data: { detail: {
                ...detail,
                scheduled: true,
                can_edit_credits: true,
                sessions: [
                    reviewSession({ id: 'excluded', name: 'Excluded', excluded: true }),
                    reviewSession({ id: 'other', name: 'Other', relation: 'other_program', credit_options: [
                        { template_id: 'template-1', name: 'Main work' },
                    ] }),
                ],
            } } },
        });

        expect(screen.getByText('Not counted')).toBeInTheDocument();
        expect(screen.getByText('Other program')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Change how Excluded counts toward this day' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Count as Main work' })).toBeDisabled();
    });
});
