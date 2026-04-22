import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import HistoryPanel from '../HistoryPanel';

const useActivityHistory = vi.fn(() => ({
    history: [],
    loading: false,
    error: null,
}));
const useProgressHistory = vi.fn(() => ({
    progressHistory: [],
    isLoading: false,
    error: null,
}));

vi.mock('../../../hooks/useActivityHistory', () => ({
    useActivityHistory: (...args) => useActivityHistory(...args),
}));

vi.mock('../../../hooks/useProgressHistory', () => ({
    useProgressHistory: (...args) => useProgressHistory(...args),
}));

vi.mock('../../../contexts/TimezoneContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTimezone: () => ({ timezone: 'UTC' }),
    };
});

const sessionActivityDefs = [
    { id: 'activity-def-1', name: 'Scales', metric_definitions: [] },
    { id: 'activity-def-2', name: 'Arpeggios', metric_definitions: [] },
];

describe('HistoryPanel', () => {
    beforeEach(() => {
        useActivityHistory.mockClear();
        useProgressHistory.mockClear();
        useActivityHistory.mockReturnValue({
            history: [],
            loading: false,
            error: null,
        });
        useProgressHistory.mockReturnValue({
            progressHistory: [],
            isLoading: false,
            error: null,
        });
    });

    it('follows the focused session activity without a sync effect', () => {
        renderWithProviders(
            <HistoryPanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={{ activity_definition_id: 'activity-def-2' }}
                sessionActivityDefs={sessionActivityDefs}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByRole('combobox')).toHaveValue('activity-def-2');
        expect(useActivityHistory).toHaveBeenCalledWith('root-1', 'activity-def-2', 'session-1', { limit: 10 });
        expect(useProgressHistory).toHaveBeenCalledWith('root-1', 'activity-def-2', {
            limit: 10,
            excludeSessionId: 'session-1',
        });
    });

    it('preserves manual selection until the chosen activity disappears, then falls back', () => {
        const { rerender } = renderWithProviders(
            <HistoryPanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={null}
                sessionActivityDefs={sessionActivityDefs}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        const select = screen.getByRole('combobox');
        expect(select).toHaveValue('activity-def-1');

        fireEvent.change(select, { target: { value: 'activity-def-2' } });
        expect(select).toHaveValue('activity-def-2');

        rerender(
            <HistoryPanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={null}
                sessionActivityDefs={[sessionActivityDefs[0]]}
            />
        );

        expect(screen.getByRole('combobox')).toHaveValue('activity-def-1');
    });

    it('renders saved progress indicators alongside history metrics', () => {
        useActivityHistory.mockReturnValue({
            history: [
                {
                    id: 'instance-1',
                    created_at: '2026-04-10T12:00:00.000Z',
                    metric_values: [
                        { metric_definition_id: 'm1', metric_id: 'm1', name: 'Quality', value: 11, unit: 'rating' },
                    ],
                    sets: [],
                    notes: [],
                },
            ],
            loading: false,
            error: null,
        });
        useProgressHistory.mockReturnValue({
            progressHistory: [
                {
                    activity_instance_id: 'instance-1',
                    metric_comparisons: [
                        {
                            metric_id: 'm1',
                            metric_name: 'Quality',
                            pct_change: 10,
                            improved: true,
                            regressed: false,
                        },
                    ],
                },
            ],
            isLoading: false,
            error: null,
        });

        renderWithProviders(
            <HistoryPanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={{ activity_definition_id: 'activity-def-1' }}
                sessionActivityDefs={[
                    {
                        id: 'activity-def-1',
                        name: 'Scales',
                        metric_definitions: [{ id: 'm1', name: 'Quality', unit: 'rating' }],
                    },
                ]}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText(/Quality: 11 rating/i)).toBeInTheDocument();
        expect(screen.getByText('(▲10%)')).toBeInTheDocument();
    });

    it('uses progress tone, not delta sign, for absolute history indicators', () => {
        useActivityHistory.mockReturnValue({
            history: [
                {
                    id: 'instance-1',
                    created_at: '2026-04-10T12:00:00.000Z',
                    metric_values: [
                        { metric_definition_id: 'm1', metric_id: 'm1', name: 'Time', value: 55, unit: 's' },
                    ],
                    sets: [],
                    notes: [],
                },
            ],
            loading: false,
            error: null,
        });
        useProgressHistory.mockReturnValue({
            progressHistory: [
                {
                    activity_instance_id: 'instance-1',
                    metric_comparisons: [
                        {
                            metric_id: 'm1',
                            metric_name: 'Time',
                            delta: -5,
                            improved: true,
                            regressed: false,
                        },
                    ],
                },
            ],
            isLoading: false,
            error: null,
        });

        renderWithProviders(
            <HistoryPanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={{ activity_definition_id: 'activity-def-1' }}
                sessionActivityDefs={[
                    {
                        id: 'activity-def-1',
                        name: 'Intervals',
                        delta_display_mode: 'absolute',
                        metric_definitions: [{ id: 'm1', name: 'Time', unit: 's' }],
                    },
                ]}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        const indicator = screen.getByText('(-5)');
        expect(indicator.className).toMatch(/historyProgressImproved/);
    });
});
