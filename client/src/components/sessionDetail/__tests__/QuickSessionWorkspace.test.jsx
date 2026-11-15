import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import QuickSessionWorkspace from '../QuickSessionWorkspace';

const { sessionData, toggleSessionComplete } = vi.hoisted(() => ({
    sessionData: { current: null },
    toggleSessionComplete: vi.fn(),
}));

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: () => sessionData.current,
    useActiveSessionActions: () => ({ toggleSessionComplete }),
}));
vi.mock('../../../contexts/TimezoneContext', () => ({ useTimezone: () => ({ timezone: 'UTC' }) }));
vi.mock('../SessionActivityItem', () => ({ default: ({ exercise }) => <div>Activity {exercise.id}</div> }));

function renderWorkspace(completed) {
    sessionData.current = {
        rootId: 'root-1',
        session: {
            id: 'quick-1', name: 'Quick Session', completed, session_type: 'quick',
            session_start: '2026-11-15T09:17:00Z',
            attributes: { session_data: { session_type: 'quick', activity_ids: ['i-1'] } },
        },
        localSessionData: { session_type: 'quick', activity_ids: ['i-1'] },
        activityInstances: [{ id: 'i-1', activity_definition_id: 'weigh' }],
        activities: [],
    };
    render(<MemoryRouter><QuickSessionWorkspace /></MemoryRouter>);
}

describe('QuickSessionWorkspace', () => {
    it('shows a completed quick session by name, with no type pill and nothing left to complete', () => {
        renderWorkspace(true);

        expect(screen.getByRole('heading', { name: 'Quick Session' })).toBeInTheDocument();
        expect(screen.getAllByText('Quick Session')).toHaveLength(1);
        expect(screen.queryByRole('button', { name: /Complete/ })).not.toBeInTheDocument();
        expect(screen.getByText('Activity i-1')).toBeInTheDocument();
    });

    it('still completes a quick session left unfinished', () => {
        renderWorkspace(false);

        fireEvent.click(screen.getByRole('button', { name: /Complete/ }));
        expect(toggleSessionComplete).toHaveBeenCalledTimes(1);
    });
});
