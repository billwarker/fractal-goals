import React from 'react';
import { render, screen } from '@testing-library/react';

import ActivityCard from '../ActivityCard';

describe('ActivityCard', () => {
    it('preserves the manage-activities presentation without mutations in read-only mode', () => {
        render(
            <ActivityCard
                activity={{
                    id: 'activity-read-only',
                    name: 'Front Lever Holds',
                    metric_definitions: [{ id: 'duration', name: 'Hold Time', unit: 'Seconds' }],
                }}
                instantiationSummary={{
                    instance_count: 3,
                    last_used_at: '2026-07-14T12:00:00Z',
                    average_duration_seconds: 90,
                }}
                readOnly
            />
        );

        expect(screen.getByText('3 instances')).toBeInTheDocument();
        expect(screen.getByText('Avg: 2m')).toBeInTheDocument();
        expect(screen.getByText('Hold Time (Seconds)')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /duplicate|delete/i })).not.toBeInTheDocument();
    });

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
