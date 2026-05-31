import {
    buildSessionDurationHistogramData,
    buildSessionTimeDistributionData,
} from '../AnalyticsExtraCharts';

describe('session extra chart helpers', () => {
    it('builds optional start and end time distributions', () => {
        const data = buildSessionTimeDistributionData([
            { session_start: '2026-04-26T16:41:00Z', session_end: '2026-04-26T17:56:00Z' },
            { session_start: '2026-04-27T16:10:00Z', session_end: '2026-04-27T18:05:00Z' },
        ], ['start', 'end']);

        expect(data.datasets.map((dataset) => dataset.label)).toEqual(['Session Start', 'Session End']);
        expect(data.datasets[0].data[12]).toBe(2);
        expect(data.datasets[1].data[13]).toBe(1);
        expect(data.datasets[1].data[14]).toBe(1);
    });

    it('builds duration histogram data with configurable bucket counts', () => {
        const data = buildSessionDurationHistogramData([
            { total_duration_seconds: 5 * 60 },
            { total_duration_seconds: 25 * 60 },
            { total_duration_seconds: 55 * 60 },
            { total_duration_seconds: 75 * 60 },
        ], 4);

        expect(data.labels).toHaveLength(4);
        expect(data.datasets[0].data.reduce((sum, count) => sum + count, 0)).toBe(4);

        expect(buildSessionDurationHistogramData([], 0).labels).toHaveLength(1);
        expect(buildSessionDurationHistogramData([], 99).labels).toHaveLength(30);
    });
});
