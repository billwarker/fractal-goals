import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import LandingActivityCatalogue from '../LandingActivityCatalogue';

describe('LandingActivityCatalogue', () => {
    const activities = [
        { id: 'rows', name: 'Bodyweight Rows', group_id: 'pull', metric_definitions: [{ id: 'reps', name: 'Reps', unit: 'count' }] },
        { id: 'holds', name: 'Front Lever Holds', group_id: 'skills', has_sets: true, metric_definitions: [] },
        { id: 'warmup', name: 'Joint Warmup', group_id: null, metric_definitions: [] },
    ];
    const activityGroups = [
        { id: 'strength', name: 'Strength', parent_id: null, sort_order: 0 },
        { id: 'pull', name: 'Pulling', parent_id: 'strength', sort_order: 0 },
        { id: 'skills', name: 'Skills', parent_id: null, sort_order: 1 },
    ];

    it('renders the example fractal catalogue as a read-only grouped hierarchy', () => {
        render(
            <LandingActivityCatalogue
                activities={activities}
                activityGroups={activityGroups}
                instantiationSummary={{
                    rows: {
                        instance_count: 4,
                        last_used_at: '2026-07-14T12:00:00Z',
                        average_duration_seconds: 300,
                    },
                }}
            />
        );

        expect(screen.getByRole('region', { name: 'Activity catalogue' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Manage Activities' })).not.toBeInTheDocument();
        expect(screen.queryByText('Read-only example')).not.toBeInTheDocument();
        expect(screen.getByText('Strength')).toBeInTheDocument();
        expect(screen.getByText('Pulling')).toBeInTheDocument();
        expect(screen.getByText('Bodyweight Rows')).toBeInTheDocument();
        expect(screen.getByText('4 instances')).toBeInTheDocument();
        expect(screen.getByText('Avg: 5m')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Ungrouped activities' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
        expect(screen.queryByText('Bodyweight Rows')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Expand All' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
        expect(screen.getByText('Bodyweight Rows')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Collapse Strength' }));
        expect(screen.queryByText('Bodyweight Rows')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Expand Strength' }));
        expect(screen.getByText('Bodyweight Rows')).toBeInTheDocument();
    });

    it('filters groups and activities without exposing edit controls', () => {
        render(<LandingActivityCatalogue activities={activities} activityGroups={activityGroups} />);

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
            target: { value: 'lever' },
        });

        expect(screen.getByText('Front Lever Holds')).toBeInTheDocument();
        expect(screen.queryByText('Bodyweight Rows')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /edit|delete|duplicate/i })).not.toBeInTheDocument();
    });
});
