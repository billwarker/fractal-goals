import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { GoalReviewComposer, GoalReviewPrompt } from '../GoalReviewSection';

const { actions } = vi.hoisted(() => ({
    actions: { isSaving: false, setReviewsOn: vi.fn(), writeReview: vi.fn(), editReview: vi.fn() },
}));
vi.mock('../GoalReviewForm', () => ({
    default: ({ onSubmit }) => <button type="button" onClick={() => onSubmit({ schema: 1, status: 'on_track' }, [])}>Submit</button>,
}));
vi.mock('../../../hooks/useGoalReviewActions', () => ({ default: () => actions }));
vi.mock('../../../contexts/TimezoneContext', () => ({ useTimezone: () => ({ timezone: 'UTC' }) }));

const goalWith = (review) => ({ id: 'g', name: 'Play in a band', review });

describe('GoalReviewPrompt', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('offers only Review when a review is due', () => {
        const onReview = vi.fn();
        render(<GoalReviewPrompt rootId="r" goalId="g" onReview={onReview} goal={goalWith({
            status: 'due', next_review_on: '2026-10-19', cadence: { value: 3, unit: 'months' },
        })} />);

        expect(screen.getByRole('region', { name: 'Review due' })).toHaveTextContent('Reviewed every 3 months');
        expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Review']);
        fireEvent.click(screen.getByRole('button', { name: 'Review' }));
        expect(onReview).toHaveBeenCalled();
    });

    it('offers a way back when reviews are off, and stays quiet otherwise', () => {
        const { rerender, container } = render(<GoalReviewPrompt rootId="r" goalId="g" goal={goalWith({ status: 'off' })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
        expect(actions.setReviewsOn).toHaveBeenCalledWith(true);

        rerender(<GoalReviewPrompt rootId="r" goalId="g" goal={goalWith({ status: 'upcoming', next_review_on: '2026-11-01' })} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('GoalReviewComposer', () => {
    it('updates the review it edits instead of writing a new one', async () => {
        actions.editReview.mockResolvedValue(true);
        const onDone = vi.fn();
        render(<GoalReviewComposer rootId="r" goalId="g" goal={goalWith(null)} editingNote={{ id: 'n1' }} onDone={onDone} />);
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
        await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(actions.editReview).toHaveBeenCalledWith('n1', { schema: 1, status: 'on_track' });
        expect(actions.writeReview).not.toHaveBeenCalled();
    });
});
