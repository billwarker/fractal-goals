import { describe, expect, it } from 'vitest';

import {
    axisTickFormatter, formatBucketLabel, formatBucketRange, formatDuration, formatMetric, snapMetricValue,
} from '../chartFormat';

const integerReps = { id: 'reps', name: 'Reps', unit: 'reps', input_type: 'integer', min_value: 0, max_value: 50 };
const tempo = { id: 'bpm', name: 'Tempo', unit: 'bpm', input_type: 'number', precision: 1 };
const hold = { id: 'hold', name: 'Hold', unit: 's', input_type: 'duration', precision: 0 };
const grade = { id: 'grade', name: 'Grade', input_type: 'number', precision: 0, predefined_values: [1, 2, 3, 5, 8] };

describe('formatDuration', () => {
    it('formats short and clock styles, treating empty as zero', () => {
        expect(formatDuration(null)).toBe('0m');
        expect(formatDuration(59)).toBe('0m');
        expect(formatDuration(3600)).toBe('1h');
        expect(formatDuration(3660)).toBe('1h 1m');
        expect(formatDuration(65, { style: 'clock' })).toBe('01:05');
        expect(formatDuration(3725, { style: 'clock' })).toBe('1:02:05');
    });
});

describe('snapMetricValue', () => {
    it('rounds integers to whole numbers and clamps to the bounds', () => {
        expect(snapMetricValue(integerReps, 7.6)).toBe(8);
        expect(snapMetricValue(integerReps, 7.4)).toBe(7);
        expect(snapMetricValue(integerReps, 72)).toBe(50);
        expect(snapMetricValue(integerReps, -3)).toBe(0);
    });

    it('rounds numbers and durations to the metric precision', () => {
        expect(snapMetricValue(tempo, 120.04)).toBe(120);
        expect(snapMetricValue(tempo, 120.05)).toBe(120.1);
        expect(snapMetricValue(hold, 44.6)).toBe(45);
    });

    it('snaps to the nearest predefined value', () => {
        expect(snapMetricValue(grade, 4.2)).toBe(5);
        expect(snapMetricValue(grade, 3.9)).toBe(3);
        expect(snapMetricValue(grade, 100)).toBe(8);
    });

    it('returns null for values that are not numbers', () => {
        expect(snapMetricValue(tempo, null)).toBeNull();
        expect(snapMetricValue(tempo, '')).toBeNull();
        expect(snapMetricValue(tempo, Number.NaN)).toBeNull();
    });
});

describe('formatMetric', () => {
    it('formats by metric type with the unit, durations as mm:ss without one', () => {
        expect(formatMetric(integerReps, 8)).toBe('8 reps');
        expect(formatMetric(tempo, 120)).toBe('120.0 bpm');
        expect(formatMetric(tempo, 120, { withUnit: false })).toBe('120.0');
        expect(formatMetric(hold, 75)).toBe('01:15');
        expect(formatMetric(tempo, null)).toBe('—');
    });
});

describe('bucket labels', () => {
    it('labels days, weeks and months', () => {
        expect(formatBucketLabel('2026-03-02', 'day')).toBe('Mar 2');
        expect(formatBucketLabel('2026-03-02', 'week')).toBe('Mar 2');
        expect(formatBucketLabel('2026-03-01', 'month')).toBe('Mar 2026');
        expect(formatBucketRange('2026-03-05', 'day')).toBe('Thu, Mar 5, 2026');
        expect(formatBucketRange('2026-12-28', 'week')).toBe('Dec 28 – Jan 3, 2027');
        expect(formatBucketRange('2026-03-01T00:00:00', 'month')).toBe('March 2026');
    });
});

describe('axisTickFormatter', () => {
    it('formats ticks per value kind', () => {
        expect(axisTickFormatter('hours')(5)).toBe('5h');
        expect(axisTickFormatter('duration')(5400)).toBe('1h 30m');
        expect(axisTickFormatter('metric', hold)(90)).toBe('01:30');
        expect(axisTickFormatter('count')(2.5)).toBe('');
        expect(axisTickFormatter('count')(3)).toBe('3');
    });
});
