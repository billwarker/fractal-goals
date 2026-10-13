import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import CompletedSessionCard from '../CompletedSessionCard';
import CompletedSessionHeader from '../CompletedSessionHeader';
import TimezoneContext from '../../../../contexts/TimezoneContext';
import { queryKeys } from '../../../../hooks/queryKeys';

const template = { id: 'template', name: 'Upper Body', color: '#88cc44' };
const activity = { id: 'hold', name: 'Hold', metric_definitions: [{ id: 'seconds', name: 'Time', unit: 'seconds' }] };
const session = {
    id: 'session', name: 'Upper Body – Light', completed: true,
    session_start: '2026-10-13T14:00:00Z', session_end: '2026-10-13T15:00:00Z',
    total_duration_seconds: 2700, updated_at: '2026-10-14T00:30:00Z',
    attributes: { session_data: { sections: [{ name: 'Main', items: [{
        type: 'circuit', circuit: {
            id: 'run', name: 'Superset', circuit_definition_id: 'circuit',
            slots: [{ id: 'slot', sort_order: 0, activity_definition_id: 'hold' }],
            rounds: [1, 2].map((round_number) => ({
                round_number, members: [{ circuit_run_slot_id: 'slot', metrics: [{ metric_id: 'seconds', value: 16 }] }],
            })),
        },
    }] }] } },
};

function wrapper({ children }) {
    return <MemoryRouter><TimezoneContext.Provider value={{ timezone: 'America/Toronto' }}>{children}</TimezoneContext.Provider></MemoryRouter>;
}

it('shows session metadata in the chosen timezone and navigates through the session badge', () => {
    render(<CompletedSessionHeader rootId="root" session={session} template={template} />, { wrapper });
    expect(screen.getByRole('link', { name: session.name })).toHaveAttribute('href', '/root/session/session');
    expect(screen.getByLabelText('Completed session')).toBeInTheDocument();
    expect(screen.getByText('Oct 13, 2026 · 10:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Oct 13, 2026 · 11:00 AM')).toBeInTheDocument();
    expect(screen.queryByText('Last modified')).not.toBeInTheDocument();
    // Persisted active time takes priority over the hour between start and end.
    expect(screen.getByText('45:00')).toBeInTheDocument();
    expect(screen.queryByText(/Open session/)).not.toBeInTheDocument();
});

it('handles legacy timestamps, subtracts paused time, and tolerates absent or invalid metadata', () => {
    const { rerender } = render(<CompletedSessionHeader rootId="root" template={template} session={{
        id: 'session', attributes: { total_paused_seconds: 600, updated_at: session.updated_at, session_data: {
            session_start: session.session_start, session_end: session.session_end,
        } },
    }} />, { wrapper });
    expect(screen.getByText('50:00')).toBeInTheDocument();
    rerender(<CompletedSessionHeader rootId="root" template={template} session={{ id: 'session', session_start: 'invalid' }} />);
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByLabelText('Completed session')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: template.name })).toBeInTheDocument();
});

it('retains logged round selection, switches members and rounds, and clears scope on background clicks', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.session('root', 'session'), session);
    const onReport = vi.fn();
    render(<QueryClientProvider client={client}>
        <CompletedSessionCard rootId="root" sessionId="session" template={template} activities={[activity]} isActive onReport={onReport} />
    </QueryClientProvider>, { wrapper });
    const card = screen.getByRole('article', { name: 'Upper Body session' });
    const scope = within(card);
    fireEvent.click(scope.getByRole('button', { name: 'Round 1' }));
    expect(scope.getByRole('button', { name: 'Round 1, selected' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(scope.getByRole('button', { name: 'Round 2 Hold' }));
    expect(scope.getByRole('button', { name: 'Round 2 Hold, selected' })).toHaveAttribute('aria-pressed', 'true');
    expect(scope.getByRole('button', { name: 'Round 2, selected' })).toHaveAttribute('aria-pressed', 'true');
    expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ selectedActivityId: 'hold' }));
    fireEvent.click(scope.getByRole('button', { name: 'Round 2 Hold, selected' }));
    expect(scope.getByRole('button', { name: 'Round 2, selected' })).toHaveAttribute('aria-pressed', 'true');
    expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ selectedActivityId: null }));
    fireEvent.click(scope.getByRole('button', { name: 'Round 2, selected' }));
    expect(scope.getByRole('button', { name: 'Round 2' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(scope.getByRole('button', { name: 'Round 1' }));
    fireEvent.click(scope.getByRole('heading', { name: 'Main' }));
    expect(card.querySelector('[data-selected="true"]')).toBeNull();
    expect(scope.queryByRole('button', { name: /Remove|Add/ })).not.toBeInTheDocument();
    expect(scope.getAllByRole('textbox').every((field) => field.readOnly)).toBe(true);
});

it('selects a logged standalone activity when its read-only field is clicked', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.session('root', 'session'), {
        ...session, attributes: { session_data: { sections: [{ name: 'Main', items: [{
            type: 'activity', activity: { instance_id: 'instance', activity_id: 'hold', name: 'Hold',
                metrics: [{ metric_id: 'seconds', value: 16 }],
            },
        }] }] } },
    });
    const onReport = vi.fn();
    render(<QueryClientProvider client={client}>
        <CompletedSessionCard rootId="root" sessionId="session" template={template} activities={[activity]} isActive onReport={onReport} />
    </QueryClientProvider>, { wrapper });
    fireEvent.click(screen.getByRole('textbox'));
    expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ selectedActivityId: 'hold' }));
});
