import React from 'react';
import { render, screen } from '@testing-library/react';

import ActivityPreviewCard from '../ActivityPreviewCard';
import TemplatePreviewCard from '../TemplatePreviewCard';

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

    it('renders template sections with resolved activity names', () => {
        render(
            <TemplatePreviewCard
                template={{
                    name: 'Practice Template',
                    template_data: {
                        sections: [{
                            name: 'Warmup',
                            activities: [{ activity_id: 'activity-1' }],
                        }],
                    },
                }}
                activityDefinitions={[{ id: 'activity-1', name: 'CAGED Triads' }]}
            />
        );

        expect(screen.getByRole('heading', { name: 'Practice Template' })).toBeInTheDocument();
        expect(screen.getByText('Warmup')).toBeInTheDocument();
        expect(screen.getByText('CAGED Triads')).toBeInTheDocument();
    });
});
