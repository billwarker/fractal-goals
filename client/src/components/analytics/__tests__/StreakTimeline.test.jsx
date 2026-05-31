import React from 'react';
import { render, screen } from '@testing-library/react';

import StreakTimeline from '../StreakTimeline';

vi.mock('../../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' }),
}));

describe('StreakTimeline', () => {
    it('uses all-time data without the previous hardcoded 90-day cutoff', () => {
        render(
            <StreakTimeline
                sessions={[
                    { id: 's1', session_start: '2024-01-01T12:00:00Z' },
                    { id: 's2', session_start: '2024-01-02T12:00:00Z' },
                ]}
                dateRange={{ start: null, end: null }}
            />
        );

        expect(screen.getByText('Activity (All Time: Latest 1 Segments)')).toBeInTheDocument();
        expect(screen.getByText('Jan 1 - Jan 2')).toBeInTheDocument();
    });

    it('caps noisy all-time timelines to the latest segment rows', () => {
        const sessions = Array.from({ length: 20 }, (_, index) => {
            const date = new Date('2024-01-01T12:00:00Z');
            date.setUTCDate(date.getUTCDate() + (index * 2));
            return {
                id: `s${index}`,
                session_start: date.toISOString(),
            };
        });

        render(
            <StreakTimeline
                sessions={sessions}
                dateRange={{ start: null, end: null }}
            />
        );

        expect(screen.getByText('Activity (All Time: Latest 12 Segments)')).toBeInTheDocument();
        expect(screen.getByText('Showing the latest 12 of 39 streak and break segments.')).toBeInTheDocument();
        expect(screen.queryByText('Jan 1 - Jan 1')).not.toBeInTheDocument();
    });

    it('shows every segment in an explicit selected time range', () => {
        render(
            <StreakTimeline
                sessions={[
                    { id: 's1', session_start: '2024-01-01T12:00:00Z' },
                    { id: 's2', session_start: '2024-01-03T12:00:00Z' },
                    { id: 's3', session_start: '2024-01-05T12:00:00Z' },
                ]}
                dateRange={{ start: '2024-01-01', end: '2024-01-05' }}
            />
        );

        expect(screen.getByText('Activity (Selected Time Range)')).toBeInTheDocument();
        expect(screen.getByText('Jan 1 - Jan 1')).toBeInTheDocument();
        expect(screen.getByText('Jan 5 - Jan 5')).toBeInTheDocument();
    });
});
