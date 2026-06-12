import React from 'react';
import { render, screen } from '@testing-library/react';

import ActivityPreviewCard from '../ActivityPreviewCard';

describe('landing preview cards', () => {
    it('renders activity metric chips from a published snapshot activity', () => {
        render(
            <ActivityPreviewCard
                activity={{
                    name: 'CAGED Triads',
                    description: 'Map chord shapes across the neck.',
                    metric_definitions: [{ id: 'm1', name: 'Reps', unit: 'count' }],
                }}
            />
        );

        expect(screen.getByRole('heading', { name: 'CAGED Triads' })).toBeInTheDocument();
        expect(screen.getByText('Reps count')).toBeInTheDocument();
    });

    it('renders an empty-state card when no activity is published', () => {
        render(<ActivityPreviewCard activity={null} />);

        expect(screen.getByRole('heading', { name: 'No activity snapshot' })).toBeInTheDocument();
    });
});
