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
                    session_template_color: '#22c55e',
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

        const sessionLink = screen.getByRole('link', { name: 'Standard Practice Session' });
        const sessionBadge = screen.getByText('Standard Practice Session');
        expect(sessionLink).toHaveAttribute('href', '/root-1/session/session-1?activityInstanceId=instance-1');
        expect(sessionBadge).toHaveStyle({ color: '#22c55e' });
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

    it('does not render yield for mixed multiplicative and non-multiplicative set metrics', () => {
        renderWithProviders(
            <ActivityTimelineCard
                instance={{
                    id: 'instance-1',
                    session_name: 'Simple Empty Template',
                    session_date: '2026-06-02T12:00:00.000Z',
                    metric_values: [],
                    sets: [
                        {
                            metrics: [
                                { metric_id: 'distance', value: 24 },
                                { metric_id: 'reps', value: 5 },
                            ],
                        },
                    ],
                    notes: [],
                }}
                activityDef={{
                    metric_definitions: [
                        { id: 'distance', name: 'Hands Distance from Feet', unit: 'Inches', is_multiplicative: false, is_additive: true },
                        { id: 'reps', name: 'Reps', unit: 'Count', is_multiplicative: true },
                    ],
                }}
                progressRecord={{
                    is_first_instance: false,
                    derived_summary: {
                        auto_aggregations: {
                            additive_totals: { distance: 24 },
                            yield_per_set: [{ set_index: 0, yield: 120 }],
                            total_yield: 120,
                            best_set_index: 0,
                            best_set_yield: 120,
                            best_set_values: { distance: 24, reps: 5 },
                        },
                        prev_auto_aggregations: {
                            yield_per_set: [{ set_index: 0, yield: 100 }],
                            total_yield: 100,
                        },
                    },
                }}
                timezone="UTC"
            />,
            {
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
                withTimezone: false,
            }
        );

        expect(screen.getByText('Hands Distance from Feet:')).toBeInTheDocument();
        expect(screen.getByText('Reps:')).toBeInTheDocument();
        expect(screen.queryByText(/Yield:/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Total yield:/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Set 1/)).toBeInTheDocument();
    });
});
