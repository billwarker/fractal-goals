import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import { ActivityTimelineCard } from '../ActivityTimeline';

describe('ActivityTimelineCard', () => {
    it('links the session label when a session href is provided', () => {
        renderWithProviders(
            <ActivityTimelineCard
                instance={{
                    id: 'instance-1',
                    session_id: 'session-1',
                    session_name: 'Standard Practice Session',
                    session_date: '2026-05-11T12:00:00.000Z',
                    name: 'Blues Chug',
                    metric_values: [],
                    sets: [],
                    notes: [],
                }}
                timezone="UTC"
                sessionHref="/root-1/session/session-1?activityInstanceId=instance-1"
                showActivityName
            />,
            {
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
                withTimezone: false,
            }
        );

        expect(screen.getByRole('link', { name: 'Standard Practice Session' }))
            .toHaveAttribute('href', '/root-1/session/session-1?activityInstanceId=instance-1');
        expect(screen.getByText('Blues Chug')).toBeInTheDocument();
    });
});
