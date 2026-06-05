import React from 'react';
import { render, screen } from '@testing-library/react';
import ActivityCard from '../ActivityCard';

describe('ActivityCard', () => {
    it('renders activity group metadata and average duration above the activity name', () => {
        render(
            <ActivityCard
                activity={{
                    type: 'activity',
                    activity_definition_id: 'activity-1',
                    name: 'Guitar Yoga Warm-Up',
                    completed: true,
                    sets: [],
                    metrics: [],
                }}
                activityDefinition={{
                    id: 'activity-1',
                    group_id: 'group-child',
                    metric_definitions: [],
                    split_definitions: [],
                }}
                activityGroups={[
                    { id: 'group-parent', name: 'Hand Health', parent_id: null },
                    { id: 'group-child', name: 'Warm-Ups', parent_id: 'group-parent' },
                ]}
                sessionStats={{
                    activity_durations: {
                        'activity-1': {
                            sample_count: 4,
                            average_duration_seconds: 300,
                        },
                    },
                }}
            />
        );

        expect(screen.getByText('Hand Health - Warm-Ups')).toBeInTheDocument();
        expect(screen.getByText('Avg 5m')).toBeInTheDocument();
        expect(screen.getByText('Hand Health - Warm-Ups').compareDocumentPosition(screen.getByText('Guitar Yoga Warm-Up')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('falls back to stored group names when the group list is not available', () => {
        render(
            <ActivityCard
                activity={{
                    type: 'activity',
                    name: 'Learning the Song',
                    group_name: 'Pickup Music - Exercises',
                    completed: true,
                    sets: [],
                    metrics: [],
                }}
                activityDefinition={{
                    metric_definitions: [],
                    split_definitions: [],
                }}
            />
        );

        expect(screen.getByText('Pickup Music - Exercises')).toBeInTheDocument();
    });

    it('shows an in-progress status badge for a started activity', () => {
        render(
            <ActivityCard
                activity={{
                    type: 'activity',
                    name: 'Guitar Solo Practice',
                    time_start: '2026-03-12T15:00:00Z',
                    time_stop: null,
                    completed: false,
                    sets: [],
                    metrics: [],
                }}
                activityDefinition={{
                    metric_definitions: [],
                    split_definitions: [],
                }}
            />
        );

        expect(screen.getByLabelText('In-progress activity')).toBeInTheDocument();
    });

    it('shows a paused status badge for a paused activity', () => {
        render(
            <ActivityCard
                activity={{
                    type: 'activity',
                    name: 'Guitar Solo Practice',
                    time_start: '2026-03-12T15:00:00Z',
                    time_stop: null,
                    is_paused: true,
                    completed: false,
                    sets: [],
                    metrics: [],
                }}
                activityDefinition={{
                    metric_definitions: [],
                    split_definitions: [],
                }}
            />
        );

        expect(screen.getByLabelText('Paused activity')).toBeInTheDocument();
        expect(screen.queryByLabelText('In-progress activity')).not.toBeInTheDocument();
    });

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
