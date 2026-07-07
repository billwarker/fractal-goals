import React from 'react';
import { screen } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import GoalViewMode from '../GoalViewMode';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: (type) => (type === 'Completed' ? '#ffcc00' : '#22d3ee'),
        getGoalSecondaryColor: () => '#0f172a',
        getGoalIcon: () => 'circle',
        getLevelByName: () => ({ icon: 'circle' }),
    }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: () => <span data-testid="goal-icon" />,
}));

const RENDER_OPTIONS = {
    withTheme: false,
    withAuth: false,
    withGoalLevels: false,
    withTimezone: false,
};

describe('GoalViewMode', () => {
    it('shows the goal completion note before the description on the details view', () => {
        renderWithProviders(
            <GoalViewMode
                mode="edit"
                goal={{
                    id: 'goal-1',
                    type: 'ImmediateGoal',
                    description: 'Practice the performance piece cleanly.',
                    attributes: {
                        id: 'goal-1',
                        type: 'ImmediateGoal',
                        description: 'Practice the performance piece cleanly.',
                    },
                }}
                goalId="goal-1"
                rootId="root-1"
                goalType="ImmediateGoal"
                goalColor="#22d3ee"
                parentGoalName="Week 3 Completed"
                isCompleted
                levelConfig={{ track_activities: false }}
                trackActivities={false}
                displayMode="modal"
                programs={[]}
                targets={[]}
                associatedActivities={[]}
                activityDefinitions={[]}
                name="She's Got It"
                description="Practice the performance piece cleanly."
                relevanceStatement=""
                setTargets={vi.fn()}
                goalCompletionNote={{
                    id: 'note-1',
                    content: 'This clicked at full speed.',
                    created_at: '2026-07-06T21:12:00Z',
                    context_type: 'goal',
                    context_id: 'goal-1',
                    goal_id: 'goal-1',
                    goal_name: "She's Got It",
                    goal_type: 'ImmediateGoal',
                    note_kind: 'goal_completion',
                    note_type: 'goal_completion_note',
                    note_type_label: 'Goal Completion Note',
                }}
            />,
            RENDER_OPTIONS
        );

        const noteLabel = screen.getByText('Goal Completion Note');
        const descriptionLabel = screen.getByText('Description');
        expect(noteLabel.compareDocumentPosition(descriptionLabel) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy();
        expect(screen.getByText('This clicked at full speed.')).toBeInTheDocument();
    });
});
