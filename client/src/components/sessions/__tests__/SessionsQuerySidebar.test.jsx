import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SessionsQuerySidebar from '../SessionsQuerySidebar';

vi.mock('../SessionCalendarHeatmap', () => ({ default: () => null }));

const filters = {
    rangePreset: '90d', rangeStart: '', rangeEnd: '', durationOperator: 'gt', durationMinutes: '',
    sortBy: 'session_start', sortOrder: 'desc', activityIds: [], goalIds: [], heatmapMode: 'count',
};

describe('SessionsQuerySidebar header', () => {
    it.each([
        [10, 75, filters, '10 of 75 sessions · last 90 days'],
        [4, 4, { ...filters, rangePreset: 'all' }, '4 sessions · all time'],
        [1, 1, { ...filters, rangePreset: '7d' }, '1 session · last 7 days'],
        [3, 3, { ...filters, rangePreset: 'custom', rangeStart: '2026-08-13', rangeEnd: '2026-11-10' },
            '3 sessions · Aug 13, 2026 – Nov 10, 2026'],
    ])('shows %i of %i sessions with the lookback', (visible, total, value, expected) => {
        render(<SessionsQuerySidebar filters={value} visibleSessionsCount={visible} totalSessionsCount={total}
            onUpdateFilters={vi.fn()} onResetFilters={vi.fn()} />);
        expect(screen.getByText(expected)).toBeInTheDocument();
    });
});

describe('SessionsQuerySidebar selected day', () => {
    it('names the selected day and clears it', () => {
        const onUpdateFilters = vi.fn();
        render(<SessionsQuerySidebar filters={{ ...filters, day: '2026-08-14' }} visibleSessionsCount={2}
            totalSessionsCount={2} onUpdateFilters={onUpdateFilters} onResetFilters={vi.fn()} />);
        expect(screen.getByText('2 sessions · Aug 14, 2026')).toBeInTheDocument();
        expect(screen.getByText('Showing Aug 14, 2026')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show all days' }));
        expect(onUpdateFilters).toHaveBeenCalledWith({ day: null });
    });
});
