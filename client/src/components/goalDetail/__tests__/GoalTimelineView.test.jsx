import React from 'react';
import { screen, within } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import GoalTimelineView from '../GoalTimelineView';

const { mockEntries } = vi.hoisted(() => ({
    mockEntries: [],
}));

vi.mock('../../../hooks/useGoalTimeline', () => ({
    DEFAULT_GOAL_TIMELINE_TYPES: ['activity', 'target', 'child_goal'],
    useGoalTimeline: () => ({
        entries: mockEntries,
        isLoading: false,
        error: null,
    }),
}));

vi.mock('../../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' }),
}));

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f172a',
        getGoalIcon: () => 'circle',
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
                type: 'child_goal',
                event_type: 'goal.created',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Created goal: HSPU Single with Good Form',
                relationship: 'descendant',
                source_goal_name: 'HSPU Single with Good Form',
                payload: {
                    goal_id: 'goal-2',
                    goal_name: 'HSPU Single with Good Form',
                    level_name: 'Short Term Goal',
                    is_smart: false,
                },
            },
            {
                id: 'goal-completed',
                type: 'child_goal',
                event_type: 'goal.completed',
                timestamp: '2026-05-13T11:37:00.000Z',
                title: 'Completed goal: Get the Right Lean Forward Freestanding',
                relationship: 'descendant',
                source_goal_name: 'Get the Right Lean Forward Freestanding',
                payload: {
                    goal_id: 'goal-3',
                    goal_name: 'Get the Right Lean Forward Freestanding',
                    level_name: 'Immediate Goal',
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
            <GoalTimelineView rootId="root-1" goalId="goal-1" />,
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
        expect(screen.getByText('HSPU Single with Good Form')).toBeInTheDocument();
        expect(screen.getByText('Completed Immediate goal:')).toBeInTheDocument();
        expect(screen.getByText('Get the Right Lean Forward Freestanding')).toBeInTheDocument();
        expect(screen.getByText('Created target: First clean rep')).toBeInTheDocument();
        expect(screen.getByText('Achieved target: First clean rep')).toBeInTheDocument();

        expect(screen.getAllByText('May 13, 2026')).toHaveLength(6);
        expect(screen.getAllByText('11:37 AM')).toHaveLength(6);
        expect(screen.getAllByText('via child goal: HSPU Single with Good Form')).toHaveLength(3);
        expect(screen.queryByText('via child goal')).not.toBeInTheDocument();
        expect(screen.queryByText('Child contribution')).not.toBeInTheDocument();
        expect(screen.queryByText('Child Goal')).not.toBeInTheDocument();
        expect(screen.queryByText('Goal created')).not.toBeInTheDocument();
        expect(screen.queryByText('Goal completed')).not.toBeInTheDocument();

        const completedGoal = screen.getByText('Completed Immediate goal:')
            .closest('div[class*="item"]');
        expect(within(completedGoal).getByText('Get the Right Lean Forward Freestanding')).toBeInTheDocument();
        expect(within(completedGoal).queryByText('Immediate Goal')).not.toBeInTheDocument();

        const completedActivity = screen.getByText('Completed activity: Freestanding HSPU Eccentrics')
            .closest('div[class*="timelineCard"]');
        expect(within(completedActivity).getByText('⏱ 5:36')).toBeInTheDocument();

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
