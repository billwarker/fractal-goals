import React from 'react';
import { screen, within } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import GoalTimelineView from '../GoalTimelineView';

const { mockEntries } = vi.hoisted(() => ({
    mockEntries: [],
}));

vi.mock('../../../hooks/useGoalTimeline', () => ({
    DEFAULT_GOAL_TIMELINE_TYPES: ['activity', 'target', 'goal_lifecycle'],
    useGoalTimeline: () => ({
        entries: mockEntries,
        isLoading: false,
        error: null,
    }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: function MockGoalIcon({
        shape,
        color,
        secondaryColor,
        isSmart,
        className = '',
    }) {
        return (
            <span
                data-testid="goal-icon"
                data-shape={shape}
                data-color={color}
                data-secondary-color={secondaryColor}
                data-smart={String(Boolean(isSmart))}
                className={className}
            />
        );
    },
}));

vi.mock('../../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' }),
}));

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: (goal) => {
            if (goal === 'Completed') return '#10b981';
            if (goal === 'Immediate Goal') return '#ffc400';
            if (goal === 'Short Term Goal') return '#8b6fff';
            if (goal?.level?.color) return goal.level.color;
            return goal?.level?.color || '#22d3ee';
        },
        getGoalSecondaryColor: (goal) => {
            if (goal === 'Completed') return '#064e3b';
            if (goal === 'Immediate Goal') return '#4a3900';
            if (goal === 'Short Term Goal') return '#181329';
            if (goal?.level?.secondary_color) return goal.level.secondary_color;
            return goal?.level?.secondary_color || '#0f172a';
        },
        getGoalIcon: (goal) => {
            if (goal === 'Immediate Goal') return 'triangle';
            if (goal === 'Short Term Goal') return 'hexagon';
            if (goal?.level?.icon) return goal.level.icon;
            return goal?.level?.icon || 'circle';
        },
    }),
}));

describe('GoalTimelineView', () => {
    beforeEach(() => {
        mockEntries.splice(0, mockEntries.length, ...[
            {
                id: 'activity-completed',
                type: 'activity',
                event_type: 'activity.completed',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Completed Handstand Practice',
                subtitle: 'Upper Body Day 2',
                relationship: 'self',
                entity_id: 'instance-1',
                payload: {
                    id: 'instance-1',
                    session_id: 'session-1',
                    session_name: 'Upper Body Day 2',
                    session_template_name: 'Strength Template',
                    session_template_color: '#22c55e',
                    name: 'Freestanding HSPU Eccentrics',
                    duration_seconds: 336,
                    metric_values: [],
                    sets: [
                        {
                            metrics: [
                                { metric_definition_id: 'reps', split_definition_id: 'wall', value: 6 },
                            ],
                        },
                    ],
                    activity_definition: {
                        metric_definitions: [{ id: 'reps', name: 'Reps', unit: 'reps' }],
                        split_definitions: [{ id: 'wall', name: 'Wall' }],
                    },
                    notes: [],
                },
            },
            {
                id: 'activity-associated',
                type: 'activity',
                event_type: 'activity.associated',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Associated activity: Handstand Practice',
                relationship: 'descendant',
                source_goal_name: 'HSPU Single with Good Form',
                payload: {
                    activity_name: 'Handstand Practice',
                },
            },
            {
                id: 'goal-created',
                type: 'goal_lifecycle',
                event_type: 'goal.created',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Created goal: HSPU Single with Good Form',
                relationship: 'descendant',
                source_goal_name: 'HSPU Single with Good Form',
                payload: {
                    goal_id: 'goal-2',
                    goal_name: 'HSPU Single with Good Form',
                    level_name: 'Short Term Goal',
                    level: {
                        id: 'level-short',
                        name: 'Short Term Goal',
                        color: '#stale-short',
                        secondary_color: '#stale-short-secondary',
                        icon: 'circle',
                    },
                    is_smart: false,
                },
            },
            {
                id: 'goal-completed',
                type: 'goal_lifecycle',
                event_type: 'goal.completed',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Completed goal: Get the Right Lean Forward Freestanding',
                relationship: 'descendant',
                source_goal_name: 'Get the Right Lean Forward Freestanding',
                entity_id: 'goal-1',
                entity_type: 'goal',
                payload: {
                    goal_id: 'goal-1',
                    goal_name: 'Get the Right Lean Forward Freestanding',
                    level_name: 'Immediate Goal',
                    level: {
                        id: 'level-immediate',
                        name: 'Immediate Goal',
                        color: '#stale-immediate',
                        secondary_color: '#stale-immediate-secondary',
                        icon: 'circle',
                    },
                    is_smart: false,
                },
            },
            {
                id: 'goal-paused',
                type: 'goal_lifecycle',
                event_type: 'goal.paused',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Paused goal: HSPU Single with Good Form',
                relationship: 'self',
                payload: {
                    goal_id: 'goal-1',
                    goal_name: 'HSPU Single with Good Form',
                    level_name: 'Short Term Goal',
                    level: {
                        id: 'level-short',
                        name: 'Short Term Goal',
                        color: '#stale-short',
                        secondary_color: '#stale-short-secondary',
                        icon: 'circle',
                    },
                    is_smart: false,
                },
            },
            {
                id: 'goal-resumed',
                type: 'goal_lifecycle',
                event_type: 'goal.resumed',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Resumed goal: HSPU Single with Good Form',
                relationship: 'self',
                payload: {
                    goal_id: 'goal-1',
                    goal_name: 'HSPU Single with Good Form',
                    level_name: 'Short Term Goal',
                    level: {
                        id: 'level-short',
                        name: 'Short Term Goal',
                        color: '#stale-short',
                        secondary_color: '#stale-short-secondary',
                        icon: 'circle',
                    },
                    is_smart: false,
                },
            },
            {
                id: 'goal-uncompleted',
                type: 'goal_lifecycle',
                event_type: 'goal.uncompleted',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Uncompleted goal: Get the Right Lean Forward Freestanding',
                relationship: 'descendant',
                source_goal_name: 'Get the Right Lean Forward Freestanding',
                payload: {
                    goal_id: 'goal-3',
                    goal_name: 'Get the Right Lean Forward Freestanding',
                    level_name: 'Immediate Goal',
                    level: {
                        id: 'level-immediate',
                        name: 'Immediate Goal',
                        color: '#stale-immediate',
                        secondary_color: '#stale-immediate-secondary',
                        icon: 'circle',
                    },
                    is_smart: false,
                },
            },
            {
                id: 'target-created',
                type: 'target',
                event_type: 'target.created',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Created target: First clean rep',
                relationship: 'descendant',
                source_goal_name: 'HSPU Single with Good Form',
                payload: {
                    name: 'First clean rep',
                    metrics: [{ name: 'Reps', value: 1, unit: 'rep' }],
                },
            },
            {
                id: 'target-achieved',
                type: 'target',
                event_type: 'target.achieved',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Achieved target: First clean rep',
                subtitle: 'Upper Body Day 2',
                relationship: 'descendant',
                source_goal_name: 'HSPU Single with Good Form',
                payload: {
                    name: 'First clean rep',
                    metrics: [{ name: 'Reps', value: 1, unit: 'rep' }],
                },
            },
        ]);
    });

    it('renders all timeline event types as consistent cards with subtle inherited context', () => {
        renderWithProviders(
            <GoalTimelineView
                rootId="root-1"
                goalId="goal-1"
                currentGoal={{
                    id: 'goal-1',
                    name: 'Get the Right Lean Forward Freestanding',
                    level: {
                        id: 'current-immediate',
                        name: 'Immediate Goal',
                        color: '#ffc400',
                        secondary_color: '#4a3900',
                        icon: 'triangle',
                    },
                }}
            />,
            {
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
                withTimezone: false,
            }
        );

        expect(screen.getByText('Completed activity: Freestanding HSPU Eccentrics')).toBeInTheDocument();
        expect(screen.getByText('Associated activity: Handstand Practice')).toBeInTheDocument();
        expect(screen.getByText('Created Short Term goal:')).toBeInTheDocument();
        expect(screen.getAllByText('HSPU Single with Good Form').length).toBeGreaterThanOrEqual(3);
        expect(screen.getByText('Completed Immediate goal:')).toBeInTheDocument();
        expect(screen.getAllByText('Get the Right Lean Forward Freestanding').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('Paused Short Term goal:')).toBeInTheDocument();
        expect(screen.getByText('Resumed Short Term goal:')).toBeInTheDocument();
        expect(screen.getByText('Uncompleted Immediate goal:')).toBeInTheDocument();
        expect(screen.getByText('Created target: First clean rep')).toBeInTheDocument();
        expect(screen.getByText('Achieved target: First clean rep')).toBeInTheDocument();

        expect(screen.getAllByText('May 13, 2026')).toHaveLength(9);
        expect(screen.getAllByText('11:37 AM')).toHaveLength(9);
        expect(screen.getAllByText('via child goal: HSPU Single with Good Form')).toHaveLength(3);
        expect(screen.queryByText('via child goal')).not.toBeInTheDocument();
        expect(screen.queryByText('Child contribution')).not.toBeInTheDocument();
        expect(screen.queryByText('Child Goal')).not.toBeInTheDocument();
        expect(screen.queryByText('Goal Events')).toBeInTheDocument();
        expect(screen.queryByText('Goal created')).not.toBeInTheDocument();
        expect(screen.queryByText('Goal completed')).not.toBeInTheDocument();

        const completedGoal = screen.getByText('Completed Immediate goal:')
            .closest('div[class*="item"]');
        expect(within(completedGoal).getByText('Get the Right Lean Forward Freestanding')).toBeInTheDocument();
        expect(within(completedGoal).queryByText('Immediate Goal')).not.toBeInTheDocument();
        const completedGoalIcon = within(completedGoal).getByTestId('goal-icon');
        expect(completedGoalIcon).toHaveAttribute('data-shape', 'triangle');
        expect(completedGoalIcon).toHaveAttribute('data-color', '#10b981');
        expect(completedGoalIcon).toHaveAttribute('data-secondary-color', '#064e3b');

        const createdGoal = screen.getByText('Created Short Term goal:')
            .closest('div[class*="item"]');
        const createdGoalIcon = within(createdGoal).getByTestId('goal-icon');
        expect(createdGoalIcon).toHaveAttribute('data-shape', 'hexagon');
        expect(createdGoalIcon).toHaveAttribute('data-color', '#8b6fff');
        expect(createdGoalIcon).toHaveAttribute('data-secondary-color', '#181329');

        const completedActivity = screen.getByText('Completed activity: Freestanding HSPU Eccentrics')
            .closest('div[class*="timelineCard"]');
        expect(within(completedActivity).getByText('5:36')).toBeInTheDocument();
        expect(screen.getByText('Strength Template')).toHaveStyle({ color: '#22c55e' });

        const achievedTarget = screen.getByText('Achieved target: First clean rep')
            .closest('div[class*="card"]')
            .parentElement;
        expect(within(achievedTarget).getByText('Upper Body Day 2')).toBeInTheDocument();
        expect(within(achievedTarget).queryByText('Target achieved')).not.toBeInTheDocument();

        expect(screen.getByText('Wall')).toBeInTheDocument();
        expect(screen.getByText('Reps:')).toBeInTheDocument();
        expect(screen.getByText('reps')).toBeInTheDocument();
    });
});
