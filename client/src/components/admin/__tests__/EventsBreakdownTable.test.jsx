import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import EventsBreakdownTable from '../EventsBreakdownTable';

const EVENTS = [
    { event_type: 'session.created', domain: 'session', count: 5, users: 2 },
    { event_type: 'session.completed', domain: 'session', count: 3, users: 2 },
    { event_type: 'note.created', domain: 'note', count: 7, users: 1 },
    { event_type: 'activity_instance.completed', domain: 'activity_instance', count: 11, users: 2 },
];

describe('EventsBreakdownTable', () => {
    it('renders every event type with counts and users', () => {
        render(<EventsBreakdownTable events={EVENTS} />);

        expect(screen.getByText('session.created')).toBeInTheDocument();
        expect(screen.getByText('activity_instance.completed')).toBeInTheDocument();
        expect(screen.getByText('11')).toBeInTheDocument();
    });

    it('filters by domain chip', () => {
        render(<EventsBreakdownTable events={EVENTS} />);

        fireEvent.click(screen.getByRole('button', { name: 'note' }));

        expect(screen.getByText('note.created')).toBeInTheDocument();
        expect(screen.queryByText('session.created')).not.toBeInTheDocument();
    });

    it('filters by search text', () => {
        render(<EventsBreakdownTable events={EVENTS} />);

        fireEvent.change(screen.getByPlaceholderText('Search event types'), {
            target: { value: 'completed' },
        });

        expect(screen.getByText('session.completed')).toBeInTheDocument();
        expect(screen.getByText('activity_instance.completed')).toBeInTheDocument();
        expect(screen.queryByText('note.created')).not.toBeInTheDocument();
    });

    it('shows an empty state when nothing matches', () => {
        render(<EventsBreakdownTable events={EVENTS} />);

        fireEvent.change(screen.getByPlaceholderText('Search event types'), {
            target: { value: 'zzz-no-match' },
        });

        expect(screen.getByText('No domain events in this window.')).toBeInTheDocument();
    });
});
