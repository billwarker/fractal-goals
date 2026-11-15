import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import ProgramDaySessionRow from '../ProgramDaySessionRow';

vi.mock('../../sessions/QuickSessionModal', () => ({
    default: ({ sessionId, sessionName, onClose }) => (
        <div role="dialog" aria-label={`Quick session: ${sessionName}`}>
            <span>Showing {sessionId}</span>
            <button type="button" onClick={onClose}>Close quick session</button>
        </div>
    ),
}));

const base = {
    id: 'session-1',
    name: 'Quick Session',
    session_start: '2026-11-15T09:00:00Z',
    completed_at: '2026-11-15T09:20:00Z',
    completed: true,
    total_duration_seconds: null,
    template: null,
};

function renderRow(session) {
    render(
        <MemoryRouter>
            <ProgramDaySessionRow rootId="root-1" session={session} timezone="UTC" />
        </MemoryRouter>
    );
}

describe('ProgramDaySessionRow', () => {
    it('opens a quick session in a modal instead of its own page', () => {
        renderRow({ ...base, session_type: 'quick' });

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Quick Session/ }));
        expect(screen.getByRole('dialog', { name: 'Quick session: Quick Session' })).toHaveTextContent('Showing session-1');

        fireEvent.click(screen.getByRole('button', { name: 'Close quick session' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('links any other session to its page', () => {
        renderRow({ ...base, name: 'Push Day', session_type: 'normal', template: { id: 't', name: 'Push Day', color: '#123456' } });
        expect(screen.getByRole('link')).toHaveAttribute('href', '/root-1/session/session-1');
        expect(screen.queryByRole('button', { name: /Push Day/ })).not.toBeInTheDocument();
    });
});
