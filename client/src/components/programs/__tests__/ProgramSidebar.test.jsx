import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import ProgramSidebar from '../ProgramSidebar';

const { draggableInstances } = vi.hoisted(() => ({ draggableInstances: [] }));
vi.mock('@fullcalendar/interaction', () => ({
    Draggable: class {
        constructor(element, options) {
            this.element = element;
            this.options = options;
            this.destroy = vi.fn();
            draggableInstances.push(this);
        }
    },
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: ({ color, secondaryColor }) => (
        <svg data-testid="goal-icon" data-color={color} data-secondary-color={secondaryColor} />
    ),
}));

vi.mock('../../../contexts/GoalLevelsContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useGoalLevels: () => ({
            getGoalColor: (type) => {
                if (type === 'Completed') return '#abcdef';
                if (type === 'MidTermGoal') return '#3b82f6';
                if (type === 'ShortTermGoal') return '#14b8a6';
                if (type === 'ImmediateGoal') return '#ef4444';
                return '#94a3b8';
            },
            getGoalSecondaryColor: (type) => type === 'Completed' ? '#654321' : '#0f172a',
            getGoalIcon: () => 'circle',
            getLevelByName: () => ({ icon: 'circle' }),
        }),
    };
});

describe('ProgramSidebar', () => {
    it('renders the authoritative program summary metrics in the sidepane', () => {
        renderWithProviders(
            <ProgramSidebar
                programMetrics={{
                    calculation_version: 'program_metrics_v1',
                    consistency: { mode: 'scheduled', rate: 0.75, current_streak: 4 },
                    outcomes: { goals_completed_in_window: 1, goals_in_scope: 3 },
                    program: { progress: { rate: 0.25 } },
                    blocks: [],
                }}
                activeBlock={null}
                blockMetrics={null}
                programGoalSeeds={[]}
                onGoalClick={vi.fn()}
                getGoalDetails={() => null}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('75% Consistency')).toBeInTheDocument();
        expect(screen.getByText('Goals completed:').closest('div')).toHaveTextContent('Goals completed: 1 / 3');
        expect(screen.queryByText('Alignment:')).not.toBeInTheDocument();
        expect(screen.getByText('Current streak:').closest('div')).toHaveTextContent('Current streak: 4 days');
        expect(screen.getByText('Program progress:').closest('div')).toHaveTextContent('Program progress: 25%');
    });

    it('renders flattened hierarchy cards and forwards clicks with full goal payloads', () => {
        const onGoalClick = vi.fn();
        const nestedGoal = {
            id: 'mid',
            type: 'MidTermGoal',
            name: 'Mid Goal',
            children: [
                {
                    id: 'short',
                    type: 'ShortTermGoal',
                    name: 'Short Goal',
                    children: [
                        {
                            id: 'immediate',
                            type: 'ImmediateGoal',
                            name: 'Immediate Goal',
                            completed: true,
                            completed_at: '2026-03-09',
                            children: [],
                        },
                    ],
                },
            ],
        };

        const byId = {
            mid: nestedGoal,
            short: nestedGoal.children[0],
            immediate: nestedGoal.children[0].children[0],
        };

        renderWithProviders(
            <ProgramSidebar
                programMetrics={{
                    daysRemaining: 10,
                    completedSessions: 1,
                    scheduledSessions: 3,
                    totalDuration: 300,
                    goalsMet: 1,
                    totalGoals: 3,
                }}
                activeBlock={null}
                blockMetrics={null}
                programGoalSeeds={[nestedGoal]}
                onGoalClick={onGoalClick}
                getGoalDetails={(id) => byId[id]}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Mid Goal')).toBeInTheDocument();
        expect(screen.getByText('Short Goal')).toBeInTheDocument();
        // Completed goals are hidden until asked for.
        expect(screen.queryByText('Immediate Goal')).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Show completed'));
        expect(screen.getByText('Immediate Goal')).toBeInTheDocument();
        const completedRow = screen.getByText('Immediate Goal').closest('[data-goal-id="immediate"]');
        const completedIcon = completedRow.querySelector('[data-testid="goal-icon"]');
        expect(completedIcon).toHaveAttribute('data-color', '#abcdef');
        expect(completedIcon).toHaveAttribute('data-secondary-color', '#654321');

        fireEvent.click(screen.getByText('Immediate Goal'));
        expect(onGoalClick).toHaveBeenCalledWith(byId.immediate);
    });

    it('filters completed goals outside the program date range', () => {
        const nestedGoal = {
            id: 'mid',
            type: 'MidTermGoal',
            name: 'Mid Goal',
            children: [
                {
                    id: 'outside',
                    type: 'ShortTermGoal',
                    name: 'Completed Before Program',
                    completed: true,
                    completed_at: '2026-05-10T12:00:00Z',
                    children: [],
                },
                {
                    id: 'inside',
                    type: 'ShortTermGoal',
                    name: 'Completed During Program',
                    completed: true,
                    completed_at: '2026-05-24T12:00:00Z',
                    children: [],
                },
            ],
        };

        const byId = {
            mid: nestedGoal,
            outside: nestedGoal.children[0],
            inside: nestedGoal.children[1],
        };

        renderWithProviders(
            <ProgramSidebar
                program={{
                    start_date: '2026-05-22T00:00:00Z',
                    end_date: '2026-05-26T00:00:00Z',
                }}
                programMetrics={null}
                activeBlock={null}
                blockMetrics={null}
                programGoalSeeds={[nestedGoal]}
                onGoalClick={vi.fn()}
                getGoalDetails={(id) => byId[id]}
                compact
                hideMetrics
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        fireEvent.click(screen.getByLabelText('Show completed'));
        expect(screen.getByText('Mid Goal')).toBeInTheDocument();
        expect(screen.queryByText('Completed Before Program')).not.toBeInTheDocument();
        expect(screen.getByText('Completed During Program')).toBeInTheDocument();
    });

    describe('creating goals from the hierarchy', () => {
        const tree = {
            id: 'long',
            type: 'LongTermGoal',
            name: 'Long Goal',
            children: [
                { id: 'open', parent_id: 'long', type: 'MidTermGoal', name: 'Open Mid', children: [] },
                { id: 'done', parent_id: 'long', type: 'MidTermGoal', name: 'Done Mid', completed: true, children: [] },
                { id: 'paused', parent_id: 'long', type: 'MidTermGoal', name: 'Paused Mid', paused: true, children: [] },
                { id: 'leaf', parent_id: 'long', type: 'ImmediateGoal', name: 'Leaf', children: [] },
            ],
        };
        const byId = Object.fromEntries([tree, ...tree.children].map((goal) => [goal.id, goal]));
        const renderSidebar = (props = {}) => renderWithProviders(
            <ProgramSidebar
                programGoalSeeds={[tree]}
                onGoalClick={vi.fn()}
                getGoalDetails={(id) => byId[id]}
                hideMetrics
                {...props}
            />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false }
        );

        it('offers "+" only after the goal icon scopes it, and never on closed or lowest-level goals', () => {
            const onStartSubGoalCreation = vi.fn();
            renderSidebar({ onStartSubGoalCreation, defaultShowCompleted: true });

            expect(screen.getByText('Select a goal’s icon to add a goal under it.')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Add a child goal/ })).not.toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Scope to Open Mid' }));
            expect(screen.getByRole('button', { name: 'Clear scope for Open Mid' })).toHaveAttribute('aria-pressed', 'true');
            fireEvent.click(screen.getByRole('button', { name: 'Add a child goal under Open Mid' }));
            expect(onStartSubGoalCreation).toHaveBeenCalledWith(expect.objectContaining({ id: 'open' }));

            ['Done Mid', 'Paused Mid', 'Leaf'].forEach((name) => {
                fireEvent.click(screen.getByRole('button', { name: `Scope to ${name}` }));
                expect(screen.queryByRole('button', { name: `Add a child goal under ${name}` })).not.toBeInTheDocument();
            });
            expect(screen.queryByRole('button', { name: 'Add a child goal under Open Mid' })).not.toBeInTheDocument();
        });

        it('keeps icons inert and shows no creation hint without a creation handler', () => {
            renderSidebar();
            expect(screen.queryByRole('button', { name: /Scope to/ })).not.toBeInTheDocument();
            expect(screen.queryByText(/to add a goal under it/)).not.toBeInTheDocument();
        });

        it('marks a just-created goal', () => {
            renderSidebar({ onStartSubGoalCreation: vi.fn(), justCreatedGoalId: 'open' });
            expect(document.querySelector('[data-goal-id="open"]')).toHaveAttribute('data-just-created', 'true');
            expect(document.querySelector('[data-goal-id="long"]')).not.toHaveAttribute('data-just-created');
        });
    });

    describe('due dates on the Program calendar page', () => {
        const tree = {
            id: 'long',
            type: 'LongTermGoal',
            name: 'Long Goal',
            deadline: '2026-12-01',
            children: [
                { id: 'soon', parent_id: 'long', type: 'MidTermGoal', name: 'Soon Mid', deadline: '2026-10-21', children: [] },
                { id: 'none', parent_id: 'long', type: 'MidTermGoal', name: 'Undated Mid', children: [] },
                { id: 'done', parent_id: 'long', type: 'MidTermGoal', name: 'Done Mid', completed: true, deadline: '2026-10-01', children: [] },
            ],
        };
        const byId = Object.fromEntries([tree, ...tree.children].map((goal) => [goal.id, goal]));
        const renderSidebar = (props = {}) => renderWithProviders(
            <ProgramSidebar
                programGoalSeeds={[tree]}
                onGoalClick={vi.fn()}
                getGoalDetails={(id) => byId[id]}
                hideMetrics
                defaultShowCompleted
                {...props}
            />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false }
        );

        beforeEach(() => { draggableInstances.length = 0; });

        it('shows due text in a column right of the tree, for open goals only', () => {
            renderSidebar({ dueToday: '2026-10-19' });
            const soonDue = document.querySelector('[data-goal-id="soon"] [data-due-tone]');
            expect(soonDue).toHaveTextContent('Due: 2d');
            // A column of its own, not part of the goal name's content.
            expect(screen.getByText('Soon Mid').parentElement.contains(soonDue)).toBe(false);
            expect(document.querySelector('[data-goal-id="long"] [data-due-tone]')).toHaveTextContent('Due: 1.4mo');
            expect(document.querySelector('[data-goal-id="none"] [data-due-tone]')).toBeNull();
            expect(document.querySelector('[data-goal-id="done"] [data-due-tone]')).toBeNull();
        });

        it('shows no due text elsewhere', () => {
            renderSidebar();
            expect(document.querySelector('[data-due-tone]')).toBeNull();
        });

        it('makes open goals drag sources for the calendar when enabled', () => {
            const { unmount } = renderSidebar({ dueToday: '2026-10-19', dueDragEnabled: true, onStartSubGoalCreation: vi.fn() });
            expect(screen.getByText(/Drag a goal onto a day to set its due date\./)).toBeInTheDocument();
            expect(draggableInstances).toHaveLength(1);
            expect(draggableInstances[0].options.itemSelector).toBe('[data-goal-due-drag="true"]');
            expect(document.querySelector('[data-goal-id="soon"]')).toHaveAttribute('data-goal-due-drag', 'true');
            expect(document.querySelector('[data-goal-id="done"]')).not.toHaveAttribute('data-goal-due-drag');
            expect(draggableInstances[0].options.eventData(document.querySelector('[data-goal-id="soon"]')))
                .toEqual({ title: 'Soon Mid', create: false });
            unmount();
            expect(draggableInstances[0].destroy).toHaveBeenCalled();
        });

        it('creates no drag source when disabled', () => {
            renderSidebar({ dueToday: '2026-10-19' });
            expect(draggableInstances).toHaveLength(0);
            expect(document.querySelector('[data-goal-due-drag]')).toBeNull();
        });
    });

    it('numbers sequence steps in order and says what a waiting step waits on', () => {
        const tree = {
            id: 'long', type: 'LongTermGoal', name: 'Long Goal',
            children: [
                { id: 's2', parent_id: 'long', type: 'MidTermGoal', name: 'Second', sequence_track_id: 't', sequence_position: 2, paused: true, pause_reason: 'sequence', children: [] },
                { id: 's1', parent_id: 'long', type: 'MidTermGoal', name: 'First', sequence_track_id: 't', sequence_position: 1, children: [] },
                { id: 'held', parent_id: 'long', type: 'MidTermGoal', name: 'Held', paused: true, pause_reason: 'manual', children: [] },
            ],
        };
        const byId = Object.fromEntries([tree, ...tree.children].map((goal) => [goal.id, goal]));
        renderWithProviders(
            <ProgramSidebar programGoalSeeds={[tree]} onGoalClick={vi.fn()} getGoalDetails={(id) => byId[id]} hideMetrics />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false }
        );

        const rows = [...document.querySelectorAll('[data-goal-id]')].map((row) => row.getAttribute('data-goal-id'));
        expect(rows).toEqual(['long', 's1', 's2', 'held']);
        expect(screen.getByLabelText('Step 1 in sequence')).toHaveTextContent('1');
        expect(screen.getByText('Paused · waiting on First')).toBeInTheDocument();
        expect(screen.getByText('Paused')).toBeInTheDocument();
    });
});

