import React from 'react';
import { render, screen, within } from '@testing-library/react';

import SessionSectionGrid from '../SessionSectionGrid';
import activityCardStyles from '../ActivityCard.module.css';

describe('SessionSectionGrid', () => {
    it('renders activities and compact circuit work in their stored section order', () => {
        const { container } = render(
            <SessionSectionGrid
                sections={[
                    {
                        name: 'Exercises',
                        duration_minutes: 60,
                        items: [
                            {
                                type: 'activity',
                                activity_instance_id: 'instance-1',
                                activity: {
                                    id: 'instance-1',
                                    instance_id: 'instance-1',
                                    activity_id: 'activity-1',
                                    type: 'activity',
                                    name: 'Hollow Hold',
                                    completed: true,
                                    duration_seconds: 30,
                                    sets: [],
                                    metrics: [],
                                },
                            },
                            {
                                type: 'circuit',
                                circuit_run_id: 'circuit-1',
                                circuit: {
                                    id: 'circuit-1',
                                    name: 'Strength Pair',
                                    status: 'completed',
                                    completed_at: '2026-07-21T18:00:00Z',
                                    duration_seconds: 90,
                                    planned_rounds: 1,
                                    slots: [
                                        { id: 'slot-1', activity_name: 'L-Sit Chin Ups' },
                                        { id: 'slot-2', activity_name: 'Dumbbell Bench Press' },
                                    ],
                                    rounds: [
                                        {
                                            id: 'round-1',
                                            round_number: 1,
                                            members: [
                                                {
                                                    id: 'member-1',
                                                    circuit_run_slot_id: 'slot-1',
                                                    metrics: [
                                                        { name: 'Reps', value: 8, unit: 'Count' },
                                                    ],
                                                },
                                                {
                                                    id: 'member-2',
                                                    circuit_run_slot_id: 'slot-2',
                                                    metrics: [
                                                        { name: 'Weight', value: 50, unit: 'Lbs' },
                                                        { name: 'Reps', value: 10, unit: 'Count' },
                                                    ],
                                                },
                                            ],
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                ]}
                activities={[
                    {
                        id: 'activity-1',
                        metric_definitions: [],
                        split_definitions: [],
                    },
                ]}
            />,
        );

        expect(screen.getByText('02:00')).toBeInTheDocument();
        expect(screen.getByLabelText('Completed circuit')).toBeInTheDocument();
        expect(screen.getByText('Circuit')).toBeInTheDocument();
        expect(screen.getByText('1 round')).toBeInTheDocument();
        expect(screen.getByText('Round 1')).toBeInTheDocument();
        expect(screen.getByText('1.1')).toBeInTheDocument();
        expect(screen.getByText('1.2')).toBeInTheDocument();
        expect(screen.getByLabelText('L-Sit Chin Ups metrics')).toHaveTextContent('Reps:8 Count');
        expect(screen.getByLabelText('Dumbbell Bench Press metrics')).toHaveTextContent('Weight:50 Lbs');

        const renderedNames = Array.from(
            container.querySelectorAll('div, h4, span'),
        ).filter((node) => ['Hollow Hold', 'Strength Pair'].includes(node.textContent));
        expect(renderedNames.map((node) => node.textContent)).toEqual([
            'Hollow Hold',
            'Strength Pair',
        ]);

        const circuitCard = screen.getByText('Strength Pair').closest('article');
        expect(circuitCard).toHaveClass(activityCardStyles.activityCard);
        expect(circuitCard).toHaveClass(activityCardStyles.activityCardInstance);
        expect(within(circuitCard).getByText('Dumbbell Bench Press')).toBeInTheDocument();
        expect(screen.getByLabelText('L-Sit Chin Ups metrics').parentElement).toContainElement(
            screen.getByText('L-Sit Chin Ups'),
        );
    });

    it('falls back to canonical activity set and instance metrics for circuit members', () => {
        render(
            <SessionSectionGrid
                sections={[
                    {
                        name: 'Exercises',
                        items: [
                            {
                                type: 'circuit',
                                circuit: {
                                    id: 'circuit-1',
                                    name: 'Strength Pair',
                                    planned_rounds: 1,
                                    slots: [
                                        {
                                            id: 'slot-1',
                                            activity_definition_id: 'activity-1',
                                            activity_instance_id: 'instance-1',
                                            activity_name: 'L-Sit Chin Ups',
                                        },
                                        {
                                            id: 'slot-2',
                                            activity_definition_id: 'activity-2',
                                            activity_instance_id: 'instance-2',
                                            activity_name: 'Plank Hold',
                                        },
                                    ],
                                    rounds: [
                                        {
                                            id: 'round-1',
                                            round_number: 1,
                                            members: [
                                                {
                                                    id: 'member-1',
                                                    circuit_run_slot_id: 'slot-1',
                                                    activity_set_id: 'set-1',
                                                    metrics: [],
                                                },
                                                {
                                                    id: 'member-2',
                                                    circuit_run_slot_id: 'slot-2',
                                                    activity_instance_id: 'instance-2',
                                                    metrics: [],
                                                },
                                            ],
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                ]}
                activities={[
                    {
                        id: 'activity-1',
                        metric_definitions: [{ id: 'metric-reps', name: 'Reps', unit: 'Count' }],
                    },
                    {
                        id: 'activity-2',
                        metric_definitions: [{ id: 'metric-time', name: 'Hold Time', unit: 'Seconds' }],
                    },
                ]}
                activityInstances={[
                    {
                        id: 'instance-1',
                        sets: [
                            {
                                id: 'set-1',
                                metrics: [{ metric_id: 'metric-reps', value: 8 }],
                            },
                        ],
                    },
                    {
                        id: 'instance-2',
                        metrics: [{ metric_id: 'metric-time', value: 30 }],
                    },
                ]}
            />,
        );

        expect(screen.getByLabelText('L-Sit Chin Ups metrics')).toHaveTextContent('Reps:8 Count');
        expect(screen.getByLabelText('Plank Hold metrics')).toHaveTextContent('Hold Time:30 Seconds');
    });

    it('keeps legacy activity-only sections working', () => {
        render(
            <SessionSectionGrid
                sections={[
                    {
                        name: 'Warm Up',
                        duration_minutes: 5,
                        activity_ids: ['instance-1'],
                    },
                ]}
                activities={[
                    {
                        id: 'activity-1',
                        metric_definitions: [],
                        split_definitions: [],
                    },
                ]}
                activityInstances={[
                    {
                        id: 'instance-1',
                        activity_definition_id: 'activity-1',
                        name: 'Arm Circles',
                        sets: [],
                        metrics: [],
                    },
                ]}
            />,
        );

        expect(screen.getByText('Arm Circles')).toBeInTheDocument();
        expect(screen.getByText('5 min (planned)')).toBeInTheDocument();
    });
});
