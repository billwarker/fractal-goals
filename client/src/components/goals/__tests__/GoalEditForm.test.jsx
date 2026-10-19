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
            startedAt="2026-01-01"
            setStartedAt={noop}
            completionCondition="children"
            setCompletionCondition={noop}
            conditionDraft={null}
            setConditionDraft={noop}
            handleCancel={noop}
            handleSave={noop}
            showActions={false}
            {...overrides}
        />
    );
}

describe('GoalEditForm', () => {
    it('uses the goal level color and shows dates and the completion condition', () => {
        const { container } = renderGoalEditForm();

        expect(container.firstElementChild).toHaveStyle({
            '--goal-edit-accent': '#facc15',
        });

        const relevanceTextarea = screen.getByPlaceholderText('Explain how this goal contributes to your higher-level objective...');
        expect(relevanceTextarea.className).toContain('relevanceTextareaFilled');

        expect(screen.getByText(/Completes on its own when every child goal is complete\./)).toBeInTheDocument();
        expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01');
        expect(screen.getByLabelText('Deadline')).toHaveAttribute('min', '2026-01-01');
    });

    it('warns, without blocking, when the deadline breaks a soft rule', () => {
        renderGoalEditForm({
            deadline: '2027-02-01',
            startedAt: '2026-10-01',
            deadlineParentGoal: { id: 'parent-1', attributes: { deadline: '2026-12-31' } },
            levelConfig: { deadline_max_value: 3, deadline_max_unit: 'months' },
        });

        const deadline = screen.getByLabelText('Deadline');
        expect(deadline).not.toHaveAttribute('max');
        expect(deadline).toHaveAttribute('aria-describedby', 'goal-deadline-warnings');
        expect(screen.getByText('Later than this level usually allows (by Jan 1)')).toBeInTheDocument();
        expect(screen.getByText('After the parent goal’s due date (Dec 31, 2026)')).toBeInTheDocument();
    });

    it('shows no warnings when the deadline fits', () => {
        renderGoalEditForm({ deadline: '2026-11-01', startedAt: '2026-10-01' });
        expect(screen.getByLabelText('Deadline')).not.toHaveAttribute('aria-describedby');
    });
});
