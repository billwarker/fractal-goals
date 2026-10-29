import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

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
        const { container } = renderGoalEditForm({ levelConfig: { uses_reviews: true } });

        expect(container.firstElementChild).toHaveStyle({
            '--goal-edit-accent': '#facc15',
        });

        expect(screen.queryByText(/Relevance/)).toBeNull();

        expect(screen.getByText(/Completes on its own when every child goal is complete\./)).toBeInTheDocument();
        expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01');
        expect(screen.getByLabelText('Deadline')).toHaveAttribute('min', '2026-01-01');
    });

    it('edits the review cadence in a Review section on reviewed levels', () => {
        const setReviewCadence = vi.fn();
        renderGoalEditForm({
            levelConfig: { uses_reviews: true, review_cadence_value: 1, review_cadence_unit: 'months' },
            reviewCadence: { value: 2, unit: 'weeks' },
            setReviewCadence,
        });

        expect(screen.getByLabelText('Description')).toHaveValue('Complete all foundational courses');
        const cadence = screen.getByRole('group', { name: 'Review cadence' });
        expect(screen.getByText('Review (SMART)').closest('div').contains(cadence)).toBe(true);
        expect(screen.getByLabelText('Review cadence amount')).toHaveValue(2);
        expect(screen.queryByRole('button', { name: /Use level default/ })).toBeNull();
        fireEvent.change(screen.getByLabelText('Review cadence amount'), { target: { value: '3' } });
        expect(setReviewCadence).toHaveBeenLastCalledWith({ value: 3, unit: 'weeks' });
        fireEvent.change(screen.getByLabelText('Review cadence unit'), { target: { value: 'months' } });
        expect(setReviewCadence).toHaveBeenLastCalledWith({ value: 2, unit: 'months' });
    });

    it('clears the cadence override when the level\'s cadence is picked again', () => {
        const setReviewCadence = vi.fn();
        renderGoalEditForm({
            levelConfig: { uses_reviews: true, review_cadence_value: 1, review_cadence_unit: 'months' },
            reviewCadence: { value: 1, unit: 'weeks' },
            setReviewCadence,
        });

        fireEvent.change(screen.getByLabelText('Review cadence unit'), { target: { value: 'months' } });
        expect(setReviewCadence).toHaveBeenLastCalledWith(null);
    });

    it('turns reviews on and off with a checkbox that shows the cadence only when on', () => {
        const setReviewsOn = vi.fn();
        const props = {
            levelConfig: { uses_reviews: true, review_cadence_value: 1, review_cadence_unit: 'months' },
            setReviewCadence: vi.fn(),
            setReviewsOn,
        };
        const { unmount } = renderGoalEditForm({ ...props, reviewsOn: false });

        const checkbox = screen.getByRole('checkbox', { name: 'Review this goal' });
        expect(checkbox).not.toBeChecked();
        expect(screen.queryByRole('group', { name: 'Review cadence' })).toBeNull();
        checkbox.click();
        expect(setReviewsOn).toHaveBeenCalledWith(true);

        unmount();
        renderGoalEditForm({ ...props, reviewsOn: true });
        const checked = screen.getByRole('checkbox', { name: 'Review this goal' });
        expect(checked).toBeChecked();
        // The cadence follows the checkbox on the same row: "Review this goal  every [n] [unit]".
        const cadence = screen.getByRole('group', { name: 'Review cadence' });
        expect(cadence.parentElement).toBe(checked.closest('label').parentElement);
        expect(cadence).toHaveTextContent(/^every/);
    });

    it('says when the next review falls under the cadence being edited', () => {
        renderGoalEditForm({
            levelConfig: { uses_reviews: true, review_cadence_value: 1, review_cadence_unit: 'months' },
            setReviewCadence: vi.fn(),
            startedAt: '2099-01-01',
            reviewCadence: { value: 2, unit: 'weeks' },
        });
        expect(screen.getByTestId('goal-next-review')).toHaveTextContent('Next review Jan 15, 2099 · 2 weeks after the start date (Jan 1, 2099)');
    });

    it('shows no Review section on levels without reviews', () => {
        renderGoalEditForm({ levelConfig: { uses_reviews: false } });

        expect(screen.getByLabelText('Description')).toBeInTheDocument();
        expect(screen.queryByText('Review (SMART)')).toBeNull();
        expect(screen.queryByRole('group', { name: 'Review cadence' })).toBeNull();
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
