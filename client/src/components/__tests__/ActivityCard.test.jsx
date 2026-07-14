import React from 'react';
import { render, screen } from '@testing-library/react';

import ActivityCard from '../ActivityCard';

describe('ActivityCard', () => {
    it('labels the calculated result of multiplicative metrics as yield', () => {
        render(
            <ActivityCard
                activity={{
                    id: 'activity-1',
                    name: 'Weighted Chin Ups',
                    has_sets: true,
                    metric_definitions: [
                        { id: 'reps', name: 'Reps', unit: 'Count', is_multiplicative: true },
                        { id: 'weight', name: 'Weight', unit: 'Lbs', is_multiplicative: true },
                    ],
                }}
                instantiationSummary={null}
                onEdit={vi.fn()}
                onDuplicate={vi.fn()}
                onDelete={vi.fn()}
                isCreating={false}
            />
        );

        expect(screen.getByText('Yield')).toBeInTheDocument();
        expect(screen.queryByText('Product')).not.toBeInTheDocument();
    });
});
