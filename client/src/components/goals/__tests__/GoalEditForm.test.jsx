import React from 'react';
import { render, screen } from '@testing-library/react';

import GoalEditForm from '../GoalEditForm';

const noop = () => {};

function renderGoalEditForm(overrides = {}) {
    return render(
        <GoalEditForm
            mode="edit"
            goal={{
                id: 'goal-1',
                attributes: {
                    id: 'goal-1',
                    parent_id: 'parent-1',
                    type: 'MidTermGoal',
                },
                children: [{ id: 'child-1' }],
            }}
            goalType="MidTermGoal"
            goalColor="#facc15"
            textColor="#0f172a"
            parentGoalName="Become a Great Guitar Player"
            name="Complete Pickup Music Intermediate Learning Pathway"
            setName={noop}
            description="Complete all foundational courses"
            setDescription={noop}
            deadline="2026-12-31"
            setDeadline={noop}
            relevanceStatement="Qualify as intermediate"
            setRelevanceStatement={noop}
            trackActivities={false}
            setTrackActivities={noop}
            completedViaChildren
            setCompletedViaChildren={noop}
            allowManualCompletion={false}
            setAllowManualCompletion={noop}
            handleCancel={noop}
            handleSave={noop}
            showActions={false}
            {...overrides}
        />
    );
}

describe('GoalEditForm', () => {
    it('uses the goal level color for relevance and progress measurement highlights', () => {
        const { container } = renderGoalEditForm();

        expect(container.firstElementChild).toHaveStyle({
            '--goal-edit-accent': '#facc15',
        });

        const relevanceTextarea = screen.getByPlaceholderText('Explain how this goal contributes to your higher-level objective...');
        expect(relevanceTextarea.className).toContain('relevanceTextareaFilled');

        const progressInfo = screen.getByText('Goal will be marked as complete when all child goals are completed.').closest('div');
        expect(progressInfo.className).toContain('infoItem');
    });
});
