import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import SessionInfoPanel from '../SessionInfoPanel';

const updateSession = vi.fn(() => Promise.resolve());

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: () => ({
        rootId: 'root-1',
        session: {
            id: 's1',
            name: 'Test Session',
            template_color: '#22c55e',
            created_at: '2026-01-01T00:00:00Z',
            program_info: null
        },
        localSessionData: {
            template_name: 'Full Body Workout',
            session_start: '2026-01-01T00:00:00Z',
            session_end: null,
            total_duration_minutes: 30
        },
        calculateTotalDuration: () => 120
    }),
    useActiveSessionActions: () => ({
        updateSession
    })
}));

vi.mock('../../../contexts/TimezoneContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTimezone: () => ({ timezone: 'UTC' })
    };
});

describe('SessionInfoPanel', () => {
    beforeEach(() => {
        updateSession.mockClear();
    });

    it('submits edited start time through async updateSession', async () => {
        renderWithProviders(<SessionInfoPanel />, {
            withTimezone: false,
            withAuth: false,
            withGoalLevels: false,
            withTheme: false
        });

        fireEvent.click(screen.getByTitle('Expand'));
        fireEvent.click(screen.getByTitle('Edit start time'));

        const input = screen.getByDisplayValue('2026-01-01T00:00');
        fireEvent.change(input, { target: { value: '2026-01-01T01:15' } });

        const saveButton = screen.getAllByRole('button', { name: 'Save time' })[0];
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(updateSession).toHaveBeenCalledTimes(1);
        });

        expect(updateSession).toHaveBeenCalledWith({
            session_start: '2026-01-01T01:15:00.000Z'
        });
    });

    it('uses the shared template badge color in the header and expanded metadata', () => {
        renderWithProviders(<SessionInfoPanel />, {
            withTimezone: false,
            withAuth: false,
            withGoalLevels: false,
            withTheme: false
        });

        expect(screen.getByText('Full Body Workout')).toHaveStyle({ color: '#22c55e' });

        fireEvent.click(screen.getByTitle('Expand'));
        const templateBadges = screen.getAllByText('Full Body Workout');
        expect(templateBadges).toHaveLength(2);
        expect(templateBadges[1]).toHaveStyle({ color: '#22c55e' });
    });
});
