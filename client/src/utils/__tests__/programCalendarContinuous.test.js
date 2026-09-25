import { describe, expect, it } from 'vitest';

import {
    canScrollWithin,
    getContinuousCellMarkers,
    getContinuousWindow,
    getMonthScrollTarget,
    getMonthStartLabel,
    getWeekRowMonth,
    shiftMonth,
    formatMonthTitle,
    startOfWeek,
} from '../programCalendarContinuous';

describe('getContinuousWindow', () => {
    it('spans a year of Sunday weeks centred on the anchor', () => {
        const window = getContinuousWindow('2026-09-25');

        expect(window).toEqual({ start: '2026-03-22', end: '2027-03-20', weeks: 52 });
        expect(new Date(`${window.start}T00:00:00Z`).getUTCDay()).toBe(0);
        expect(startOfWeek('2026-09-25')).toBe('2026-09-20');
    });

    it('only scrolls to dates that can reach the top row', () => {
        const window = getContinuousWindow('2026-09-25');

        expect(canScrollWithin('2026-03-22', window)).toBe(true);
        expect(canScrollWithin('2027-01-23', window)).toBe(true);
        expect(canScrollWithin('2027-01-24', window)).toBe(false);
        expect(canScrollWithin('2026-03-21', window)).toBe(false);
    });
});

describe('week rows and months', () => {
    it('assigns a row spanning a month edge to its Thursday month', () => {
        // Sep 27 – Oct 3, 2026: Thursday is Oct 1.
        expect(getWeekRowMonth(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']))
            .toBe('2026-10-01');
        // Aug 30 – Sep 5, 2026: Thursday is Sep 3.
        expect(getWeekRowMonth(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']))
            .toBe('2026-09-01');
    });

    it('scrolls to the first Thursday so the target month owns the top row', () => {
        expect(getMonthScrollTarget('2026-10-01')).toBe('2026-10-01');
        expect(getMonthScrollTarget('2026-11-01')).toBe('2026-11-05');
        expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
        expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
        expect(formatMonthTitle('2026-10-01')).toBe('October 2026');
    });

    it('labels and marks month edges', () => {
        expect(getMonthStartLabel('2026-10-01')).toBe('Oct');
        expect(getMonthStartLabel('2026-10-02')).toBeNull();
        expect(getContinuousCellMarkers('2026-10-01')).toEqual({ monthEdgeTop: true, monthEdgeLeft: true, alternateMonth: true });
        expect(getContinuousCellMarkers('2026-11-01')).toEqual({ monthEdgeTop: true, monthEdgeLeft: false, alternateMonth: false });
        expect(getContinuousCellMarkers('2026-10-08')).toEqual({ monthEdgeTop: false, monthEdgeLeft: false, alternateMonth: true });
    });
});
