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

    it('uses an activity-level delta display override over the root mode', () => {
        render(
            <ActivityCard
                activity={{
                    type: 'activity',
                    name: 'Bench Press',
                    completed: true,
                    sets: [],
                    metrics: [{ metric_id: 'weight', value: 140 }],
                    progress_comparison: {
                        is_first_instance: false,
                        metric_comparisons: [{
                            metric_id: 'weight',
                            previous_value: 135,
                            current_value: 140,
                            delta: 5,
                            pct_change: 3.7,
                            improved: true,
                            regressed: false,
                        }],
                    },
                }}
                activityDefinition={{
                    delta_display_mode: 'absolute',
                    metric_definitions: [
                        { id: 'weight', name: 'Weight', unit: 'lbs' },
                    ],
                    split_definitions: [],
                }}
                deltaDisplayMode="percent"
            />
        );

        expect(screen.getByText('(+5)')).toBeInTheDocument();
        expect(screen.queryByText('(▲3.7%)')).not.toBeInTheDocument();
    });
});
