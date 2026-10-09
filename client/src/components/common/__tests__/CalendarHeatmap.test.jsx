import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CalendarHeatmap from '../CalendarHeatmap';
import { buildHeatmapCalendar, heatmapIntensity } from '../calendarHeatmapModel';

const days = Array.from({ length: 10 }, (_, index) => ({ date: `2026-01-${String(index + 1).padStart(2, '0')}`, activities: index }));

describe('CalendarHeatmap', () => {
    it('preserves chronological days across a leap day and pads only outside the range', () => {
        const data = [{ date: '2024-03-01' }, { date: '2024-02-29' }, { date: '2024-02-28' }];
        const calendar = buildHeatmapCalendar(data);
        expect(calendar.columns.flat().filter((day) => day.inRange).map((day) => day.date)).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
        expect(calendar.months[0].label).toBe('Feb');
    });

    it('avoids overlapping labels when a range starts just before a new month', () => {
        const calendar = buildHeatmapCalendar([{ date: '2026-05-30' }, { date: '2026-06-15' }]);
        expect(calendar.months.map((month) => month.label)).toEqual(['Jun']);
    });

    it('offers one tab stop and arrow navigation to days and weeks', () => {
        const onSelectDay = vi.fn();
        render(<CalendarHeatmap days={days} getLevel={(day) => heatmapIntensity(day.activities)} getLabel={(day) => day.date} onSelectDay={onSelectDay} />);
        const cells = screen.getAllByRole('button');
        expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
        fireEvent.keyDown(cells.at(-1), { key: 'ArrowLeft' });
        expect(screen.getByRole('button', { name: '2026-01-03' })).toHaveFocus();
        fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' });
        expect(screen.getByRole('button', { name: '2026-01-02' })).toHaveFocus();
        fireEvent.keyDown(document.activeElement, { key: 'Home' });
        expect(cells[0]).toHaveFocus();
        fireEvent.click(cells[0]);
        expect(onSelectDay).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-01-01' }));
    });

    it('keeps year boundaries in one calendar with continuous keyboard navigation', () => {
        render(<CalendarHeatmap days={[{ date: '2025-12-31' }, { date: '2026-01-01' }]} showYears getLevel={() => 0} getLabel={(day) => day.date} />);
        expect(screen.getAllByRole('region', { name: 'Activity calendar' })).toHaveLength(1);
        expect(screen.getByText('2025 / 2026')).toBeInTheDocument();
        expect(screen.getAllByRole('button')).toHaveLength(2);
        expect(screen.getAllByRole('button').filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
        fireEvent.keyDown(screen.getByRole('button', { name: '2026-01-01' }), { key: 'ArrowUp' });
        expect(screen.getByRole('button', { name: '2025-12-31' })).toHaveFocus();
    });

    it('retains every date in a multi-year calendar without a 200-day cap', () => {
        const calendar = buildHeatmapCalendar([{ date: '2024-12-15' }, { date: '2026-01-15' }]);
        expect(calendar.columns.flat().filter((day) => day.inRange)).toHaveLength(397);
        expect(calendar.years.map((year) => year.label)).toEqual(['2024 / 2025', '2026']);
    });

    it.each([[0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [6, 3], [7, 4], [999, 4]])('uses fixed count bands for %s', (value, expected) => {
        expect(heatmapIntensity(value)).toBe(expected);
    });
    it.each([[0, 0], [0.5, 1], [14.9, 1], [15, 2], [30, 3], [60, 4]])('uses exact minute thresholds for %s', (value, expected) => {
        expect(heatmapIntensity(value, 'duration')).toBe(expected);
    });
});
