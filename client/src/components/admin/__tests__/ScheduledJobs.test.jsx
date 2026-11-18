import React from 'react';
import { render, screen, within } from '@testing-library/react';

import ScheduledJobs from '../ScheduledJobs';

const recent = () => new Date().toISOString();

describe('ScheduledJobs', () => {
    it('lists both jobs and stays quiet while they succeed', () => {
        render(<ScheduledJobs jobs={{
            export: { last_run_at: recent(), last_success_at: recent() },
            retention: { last_run_at: recent(), last_success_at: recent() },
        }} />);

        expect(screen.getByRole('row', { name: /BigQuery export/ })).toBeInTheDocument();
        expect(screen.getByRole('row', { name: /Data retention/ })).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('warns about a job with no success in 48 hours, or none ever', () => {
        render(<ScheduledJobs jobs={{
            export: { last_run_at: recent(), last_success_at: '2026-01-01T00:00:00Z' },
            retention: { last_run_at: null, last_success_at: null },
        }} />);

        const warnings = screen.getAllByRole('status').map((warning) => warning.textContent);
        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toMatch(/BigQuery export \(nightly\) hasn’t succeeded.*build up in Postgres/);
        expect(warnings[1]).toMatch(/Data retention \(daily\).*Cloud Scheduler trigger/);
        expect(within(screen.getByRole('row', { name: /Data retention/ })).getAllByText('Never')).toHaveLength(2);
    });
});
