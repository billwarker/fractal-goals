import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import SessionInfoPanel from '../SessionInfoPanel';

const updateSession = vi.fn(() => Promise.resolve());

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSession: () => ({
        rootId: 'root-1',
        session: {
            id: 's1',
            name: 'Test Session',
            created_at: '2026-01-01T00:00:00Z',
            program_info: null
        },
        localSessionData: {
            session_start: '2026-01-01T00:00:00Z',
            session_end: null,
            total_duration_minutes: 30
        },
        updateSession,
        calculateTotalDuration: () => 120
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

        const saveButton = screen.getAllByRole('button', { name: '✓' })[0];
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(updateSession).toHaveBeenCalledTimes(1);
        });

        expect(updateSession).toHaveBeenCalledWith({
            session_start: '2026-01-01T01:15:00.000Z'
        });
    });
});
