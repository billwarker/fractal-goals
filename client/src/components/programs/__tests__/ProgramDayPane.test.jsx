import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
        sessions: [],
    }],
    other_sessions: [],
};

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

describe('ProgramDayPane', () => {
    it('renders a single exact start action for an incomplete current-day occurrence', () => {
        const props = renderPane();

        expect(screen.queryByRole('img', { name: /Strength day/ })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Start Main work' })).toHaveAttribute(
            'href',
            '/root-1/create-session?program_id=program-1&program_day_id=day-1&date=2026-09-02&template_id=template-1',
        );
        const startLink = screen.getByRole('link', { name: 'Start Main work' });
        expect(within(startLink).getByText('Start')).toBeInTheDocument();
        expect(within(startLink).getByTitle('Main work').className).toContain('sizeSm');
        expect(screen.getByTitle('Main work')).toHaveStyle({
            borderColor: 'rgb(51, 102, 153)',
            color: 'rgb(51, 102, 153)',
        });
        expect(screen.getByText('Foundation')).toHaveStyle({ color: 'rgb(192, 90, 36)' });
        expect(screen.queryByText('Noisy activity detail')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Build strength' }));
        expect(props.onGoalClick).toHaveBeenCalledWith(props.goals[0]);
        expect(screen.queryByRole('button', { name: 'Edit definition' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove from this date' })).not.toBeInTheDocument();
        expect(screen.queryByText('Attach a goal…')).not.toBeInTheDocument();
        expect(screen.getByText(/1 needed to meet this day/)).toBeInTheDocument();
    });

    it('uses the Sessions completion check treatment instead of a text status badge', () => {
        const completedSession = {
            id: 'session-1',
            name: 'Main work session',
            template_id: 'template-1',
            session_start: '2026-09-02T14:00:00Z',
            session_end: '2026-09-02T14:20:00Z',
            total_duration_seconds: 1200,
            completed: true,
            is_paused: false,
            template: { id: 'template-1', name: 'Main work', color: '#0dbdc9' },
            activity_summaries: [{
                id: 'activity-1', name: 'Noisy activity detail', duration_seconds: 300, completed: true,
            }],
        };
        const completedDetail = {
            ...detail,
            occurrences: [{
                ...detail.occurrences[0],
                requirements: {
                    ...detail.occurrences[0].requirements,
                    requirements_met: true,
                    completed_template_ids: ['template-1'],
                },
                templates: [{ ...detail.occurrences[0].templates[0], status: 'completed' }],
                sessions: [completedSession],
            }],
        };
        renderPane({ query: { data: { detail: completedDetail } } });

        expect(screen.getByRole('img', { name: 'Strength day: requirements met' })).toHaveTextContent('✓');
        expect(screen.getByLabelText('Main work session: completed')).toBeInTheDocument();
        const sessionLink = screen.getByRole('link', { name: /Main work.*20 minutes.*Start 2:00 PM.*End 2:20 PM/i });
        expect(sessionLink).toHaveAttribute('href', '/root-1/session/session-1');
        expect(within(sessionLink).getByTitle('Main work')).toHaveStyle({ color: 'rgb(13, 189, 201)' });
        expect(screen.getAllByTitle('Main work')).toHaveLength(1);
        expect(screen.queryByRole('link', { name: /Start Main work/ })).not.toBeInTheDocument();
        expect(screen.queryByText('Noisy activity detail')).not.toBeInTheDocument();
        expect(screen.queryByText('completed')).not.toBeInTheDocument();
    });

    it('shows an x only after an incomplete program day has closed', () => {
        renderPane({ today: '2026-09-03' });

        expect(screen.getByRole('img', { name: 'Strength day: missed' })).toHaveTextContent('✗');
        expect(screen.queryByRole('link', { name: /Start Main work/ })).not.toBeInTheDocument();
    });

    it('continues an active template instead of offering a duplicate session', () => {
        const activeSession = {
            id: 'session-active', name: 'Main work session', template_id: 'template-1', completed: false,
        };
        const activeDetail = {
            ...detail,
            occurrences: [{
                ...detail.occurrences[0],
                templates: [{ ...detail.occurrences[0].templates[0], status: 'in_progress' }],
                sessions: [activeSession],
            }],
        };
        renderPane({ query: { data: { detail: activeDetail } } });

        expect(screen.getByRole('link', { name: 'Continue Main work' })).toHaveAttribute(
            'href', '/root-1/session/session-active',
        );
        expect(within(screen.getByRole('link', { name: 'Continue Main work' })).getByText('Continue')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Start Main work' })).not.toBeInTheDocument();
    });

    it('uses each outstanding template color while keeping actions aligned', () => {
        const multiTemplateDetail = {
            ...detail,
            occurrences: [{
                ...detail.occurrences[0],
                templates: [
                    detail.occurrences[0].templates[0],
                    { id: 'template-2', name: 'Review', color: '#0dbdc9', status: 'pending' },
                ],
            }],
        };
        renderPane({ query: { data: { detail: multiTemplateDetail } } });

        expect(screen.getByRole('link', { name: 'Start Main work' }).className).toContain('startAction');
        expect(screen.getByRole('link', { name: 'Start Review' }).className).toContain('startAction');
        expect(screen.getByTitle('Main work')).toHaveStyle({ color: 'rgb(51, 102, 153)' });
        expect(screen.getByTitle('Review')).toHaveStyle({ color: 'rgb(13, 189, 201)' });
    });

    it('offers reusable and dated scheduling actions on an empty date', () => {
        const onScheduleDay = vi.fn();
        const onCreateDay = vi.fn();
        const reusable = { id: 'reusable-1', name: 'Reusable', date: null };
        renderPane({
            query: { data: { detail: { occurrences: [], other_sessions: [] } } },
            blocks: [{ id: 'block-1', name: 'Foundation', days: [reusable] }],
            onScheduleDay,
            onCreateDay,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Schedule Reusable · Foundation' }));
        fireEvent.click(screen.getByRole('button', { name: 'New day in Foundation' }));
        expect(onScheduleDay).toHaveBeenCalledWith('block-1', '2026-09-02', reusable);
        expect(onCreateDay).toHaveBeenCalledWith('block-1', '2026-09-02');
    });
});
