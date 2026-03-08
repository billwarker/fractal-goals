import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import HistoryPanel from '../HistoryPanel';

const useActivityHistory = vi.fn(() => ({
    history: [],
    loading: false,
    error: null,
}));

vi.mock('../../../hooks/useActivityHistory', () => ({
    useActivityHistory: (...args) => useActivityHistory(...args),
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
        useActivityHistory.mockReturnValue({
            history: [],
            loading: false,
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
        expect(useActivityHistory).toHaveBeenCalledWith('root-1', 'activity-def-2', 'session-1');
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
});
