import React from 'react';
import { render, screen, within } from '@testing-library/react';

import ProgramBlocksSummary from '../ProgramBlocksSummary';

const metrics = {
    blocks: [
        { block_id: 'future', name: 'Month 2', start_date: '2026-10-01', end_date: '2026-10-31', adherence: { met_days: 0, scheduled_days_observed: 3 }, alignment: { duration_seconds: { rate: null } }, linked_sessions: 0, program_days: [{ program_day_id: 'practice-2', name: 'Daily Practice', completed_occurrences: 0, scheduled_occurrences: 31 }] },
        { block_id: 'current', name: 'Month 1', start_date: '2026-09-01', end_date: '2026-09-30', color: '#ef4444', adherence: { met_days: 14, scheduled_days_observed: 30 }, alignment: { duration_seconds: { rate: 0.85 } }, linked_sessions: 14, program_days: [{ program_day_id: 'practice', name: 'Daily Practice', completed_occurrences: 9, scheduled_occurrences: 30 }] },
    ],
};

describe('ProgramBlocksSummary', () => {
    it('lists every block in date order with its results, dates, and status', () => {
        render(<ProgramBlocksSummary metrics={metrics} today="2026-09-20" />);

        const rows = screen.getAllByRole('listitem').filter((row) => row.getAttribute('aria-label'));
        expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['Month 1', 'Month 2']);
        const current = screen.getByRole('listitem', { name: 'Month 1' });
        expect(within(current).getByText('Current')).toBeInTheDocument();
        expect(within(current).getByText('Sep 1 – Sep 30')).toBeInTheDocument();
        expect(within(current).getByText('14 / 30')).toBeInTheDocument();
        expect(within(current).getByText('85%')).toBeInTheDocument();
        expect(within(current).getByText('Daily Practice').closest('li')).toHaveTextContent('Daily Practice9 / 30');
        expect(within(screen.getByRole('listitem', { name: 'Month 2' })).getByText('Upcoming')).toBeInTheDocument();
    });

    it('explains a program without blocks and loading or failed results', () => {
        const { rerender } = render(<ProgramBlocksSummary metrics={{ blocks: [] }} />);
        expect(screen.getByText('This program has no blocks yet.')).toBeInTheDocument();

        rerender(<ProgramBlocksSummary loading />);
        expect(screen.getByText('Loading block results…')).toBeInTheDocument();

        rerender(<ProgramBlocksSummary error={new Error('boom')} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Block results could not be loaded');
    });
});
