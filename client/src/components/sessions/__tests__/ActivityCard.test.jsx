import React from 'react';
import { render, screen } from '@testing-library/react';
import ActivityCard from '../ActivityCard';

describe('ActivityCard', () => {
    it('renders sets when the payload has sets even if has_sets is omitted', () => {
        render(
            <ActivityCard
                activity={{
                    type: 'activity',
                    name: 'Bench Press',
                    completed: true,
                    sets: [
                        {
                            metrics: [
                                { metric_id: 'weight', value: 135 },
                                { metric_id: 'reps', value: 5 },
                            ],
                        },
                    ],
                    metrics: [],
                }}
                activityDefinition={{
                    metric_definitions: [
                        { id: 'weight', name: 'Weight', unit: 'lbs' },
                        { id: 'reps', name: 'Reps', unit: '' },
                    ],
                    split_definitions: [],
                }}
            />
        );

        expect(screen.getByText('SET 1')).toBeInTheDocument();
        expect(screen.getByText('Weight:')).toBeInTheDocument();
        expect(screen.getAllByText(/135 lbs/).length).toBeGreaterThan(0);
        expect(screen.getByText('Reps:')).toBeInTheDocument();
        expect(screen.getAllByText(/5/).length).toBeGreaterThan(0);
    });
});
