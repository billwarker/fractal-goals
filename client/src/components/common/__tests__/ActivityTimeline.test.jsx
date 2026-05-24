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

    it('renders metric labels, units, and split names for set-based timeline entries', () => {
        renderWithProviders(
            <ActivityTimelineCard
                instance={{
                    id: 'instance-1',
                    session_name: 'Upper Body Day 2',
                    session_date: '2026-05-13T12:00:00.000Z',
                    name: 'Freestanding HSPU Eccentrics',
                    metric_values: [],
                    sets: [
                        {
                            metrics: [
                                { metric_definition_id: 'reps', split_definition_id: 'left', value: 6 },
                                { metric_id: 'tempo', split_id: 'left', value: 3 },
                            ],
                        },
                    ],
                    notes: [],
                }}
                activityDef={{
                    metric_definitions: [
                        { id: 'reps', name: 'Reps', unit: 'reps' },
                        { id: 'tempo', name: 'Tempo', unit: 'sec' },
                    ],
                    split_definitions: [
                        { id: 'left', name: 'Left side' },
                    ],
                }}
                timezone="UTC"
                showActivityName
            />,
            {
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
                withTimezone: false,
            }
        );

        expect(screen.getAllByText('Left side')).toHaveLength(2);
        expect(screen.getByText('Reps:')).toBeInTheDocument();
        expect(screen.getByText('reps')).toBeInTheDocument();
        expect(screen.getByText('Tempo:')).toBeInTheDocument();
        expect(screen.getByText('sec')).toBeInTheDocument();
    });
});
