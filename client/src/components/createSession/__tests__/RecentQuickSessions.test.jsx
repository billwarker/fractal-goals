import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import RecentQuickSessions from '../RecentQuickSessions';

const definitions = [
    { id: 'weigh', name: 'Weigh-in' },
    { id: 'scales', name: 'Scales', has_sets: true },
];
const session = {
    id: 'quick-1',
    session_start: '2026-11-12T08:00:00Z',
    attributes: { session_data: { activity_ids: ['i-2', 'i-1'] } },
    activity_instances: [
        { id: 'i-1', activity_definition_id: 'weigh', metrics: [{ metric_id: 'weight', value: 82.4 }], sets: [] },
        { id: 'i-2', activity_definition_id: 'scales', metrics: [], sets: [{ metrics: [{ metric_id: 'bpm', value: 90 }] }] },
    ],
};

function renderList(props = {}) {
    const onRepeat = vi.fn();
    render(
        <RecentQuickSessions
            sessions={[session]}
            activityDefinitions={definitions}
            timezone="UTC"
            onRepeat={onRepeat}
            {...props}
        />
    );
    return onRepeat;
}

const card = () => screen.getByRole('button', { name: /^Log Scales, Weigh-in again \(last Thu, Nov 12, 2026/ });

describe('RecentQuickSessions', () => {
    it('shows each session as a card of its activity names, in logged order, without values', () => {
        renderList();
        expect(card()).toHaveTextContent('ScalesWeigh-in');
        expect(screen.queryByText(/82\.4/)).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /View/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Repeat' })).not.toBeInTheDocument();
    });

    it('logs the activities again as soon as a card is picked, without asking', () => {
        const onRepeat = renderList();
        fireEvent.click(card());
        expect(onRepeat).toHaveBeenCalledWith(session);
        expect(screen.queryByRole('button', { name: /Replace|Add to/ })).not.toBeInTheDocument();
    });

    it('marks a completion still waiting for signal', () => {
        renderList({ sessions: [{ ...session, pending: true }] });
        expect(screen.getByText('Waiting to sync')).toBeInTheDocument();
    });

    it('explains an empty list', () => {
        renderList({ sessions: [] });
        expect(screen.getByText('Quick sessions you complete will appear here.')).toBeInTheDocument();
    });
});
