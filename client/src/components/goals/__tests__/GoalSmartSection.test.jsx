import React from 'react';
import { render, screen } from '@testing-library/react';

import GoalSmartSection from '../GoalSmartSection';

const review = { status: 'due', next_review_on: '2020-01-12', cadence: { value: 3, unit: 'months', source: 'level' } };
const goal = { id: 'g', name: 'Play in a band', review, attributes: { parent_id: 'p', description: 'Gig with friends' } };

describe('GoalSmartSection', () => {
    it('shows the description without a review line (the banner says when one is due)', () => {
        render(<GoalSmartSection goal={goal} />);

        expect(screen.getByText('Description')).toBeInTheDocument();
        expect(screen.getByText('Gig with friends')).toBeInTheDocument();
        expect(screen.queryByText(/Review every/)).toBeNull();
    });

    it('says when there is no description', () => {
        render(<GoalSmartSection goal={{ id: 'g', attributes: {} }} />);
        expect(screen.getByText('No description')).toBeInTheDocument();
    });
});
