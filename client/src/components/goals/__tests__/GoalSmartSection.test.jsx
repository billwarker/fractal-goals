import React from 'react';
import { render, screen } from '@testing-library/react';

import GoalSmartSection from '../GoalSmartSection';

vi.mock('../../../contexts/TimezoneContext', () => ({ useTimezone: () => ({ timezone: 'UTC' }) }));

const review = { status: 'upcoming', next_review_on: '2099-01-12', cadence: { value: 3, unit: 'months', source: 'level' } };
const goal = { id: 'g', name: 'Play in a band', review, attributes: { parent_id: 'p', description: 'Gig with friends' } };

describe('GoalSmartSection', () => {
    it('shows the description and, on reviewed levels, the review schedule', () => {
        render(<GoalSmartSection goal={goal} mode="view" usesReviews />);

        expect(screen.getByText('Description')).toBeInTheDocument();
        expect(screen.getByText('Gig with friends')).toBeInTheDocument();
        // No heading of its own: the schedule sits under the description.
        expect(screen.queryByText('Review', { exact: true })).toBeNull();
        expect(screen.getByTestId('goal-review-cadence')).toHaveTextContent('Review every 3 months · next Jan 12');
    });

    it('shows no review section on other levels or while creating', () => {
        const { rerender } = render(<GoalSmartSection goal={goal} mode="view" />);
        expect(screen.queryByTestId('goal-review-cadence')).toBeNull();

        rerender(<GoalSmartSection goal={goal} mode="create" usesReviews />);
        expect(screen.queryByTestId('goal-review-cadence')).toBeNull();
    });
});
