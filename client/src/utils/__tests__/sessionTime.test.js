import { describe, expect, it } from 'vitest';

import {
    calculateSectionDurationFromInstanceIds,
    calculateSessionItemDuration,
    liveCircuitSeconds,
    liveInstanceSeconds,
    calculateTotalCompletedDuration,
} from '../sessionTime';

const activities = [
    { id: 'ordinary-1', duration_seconds: 30 },
    { id: 'ordinary-2', duration_seconds: 45 },
];
const circuits = [{ id: 'circuit-1', duration_seconds: 120 }];

describe('sessionTime circuit totals', () => {
    it('sums typed section activities and circuits without counting unrelated rows', () => {
        const section = {
            items: [
                { type: 'activity', activity_instance_id: 'ordinary-1' },
                { type: 'circuit', circuit_run_id: 'circuit-1' },
            ],
        };

        expect(calculateSectionDurationFromInstanceIds(section, activities, circuits)).toBe(150);
    });

    it('keeps legacy activity_ids sections compatible', () => {
        expect(calculateSectionDurationFromInstanceIds(
            { activity_ids: ['ordinary-1', 'ordinary-2'] },
            activities,
            circuits,
        )).toBe(75);
    });

    it('includes circuit duration in live and completed-session fallback totals', () => {
        expect(calculateSessionItemDuration(activities, circuits)).toBe(195);
        expect(calculateSessionItemDuration(activities, circuits, {
            sections: [{ items: [{ type: 'circuit', circuit_run_id: 'circuit-1' }] }],
        })).toBe(120);
        expect(calculateTotalCompletedDuration(
            { sections: [{ items: [{ type: 'circuit', circuit_run_id: 'circuit-1' }] }] },
            activities,
            circuits,
        )).toBe(120);
    });
});

describe('live durations', () => {
    const now = new Date('2026-01-01T00:10:00Z').getTime();

    it('counts a running instance from its start, minus its own and the current session pause', () => {
        const instance = { time_start: '2026-01-01T00:05:00Z', total_paused_seconds: 30, duration_seconds: null };
        expect(liveInstanceSeconds(instance, null, now)).toBe(270);
        const paused = { is_paused: true, last_paused_at: '2026-01-01T00:09:00Z' };
        expect(liveInstanceSeconds(instance, paused, now)).toBe(210);
        // A pause from before the timer started isn't subtracted.
        expect(liveInstanceSeconds(instance, { is_paused: true, last_paused_at: '2026-01-01T00:00:00Z' }, now)).toBe(270);
    });

    it('uses the recorded duration once stopped, completed or reset', () => {
        expect(liveInstanceSeconds({ time_start: '2026-01-01T00:05:00Z', time_stop: '2026-01-01T00:06:00Z', duration_seconds: 60 }, null, now)).toBe(60);
        expect(liveInstanceSeconds({ time_start: '2026-01-01T00:05:00Z', completed: true, duration_seconds: 45 }, null, now)).toBe(45);
        expect(liveInstanceSeconds({ time_start: null, duration_seconds: null }, null, now)).toBe(0);
    });

    it('stops a circuit at its pause and at completion', () => {
        expect(liveCircuitSeconds({ status: 'active', time_start: '2026-01-01T00:09:00Z', total_paused_seconds: 10 }, now)).toBe(50);
        expect(liveCircuitSeconds({ status: 'paused', time_start: '2026-01-01T00:09:00Z', last_paused_at: '2026-01-01T00:09:30Z' }, now)).toBe(30);
        expect(liveCircuitSeconds({ status: 'completed', time_start: '2026-01-01T00:09:00Z', duration_seconds: 99 }, now)).toBe(99);
    });

    it('sums items live only when asked', () => {
        const instances = [
            { id: 'a', duration_seconds: 100 },
            { id: 'b', time_start: '2026-01-01T00:09:00Z' },
            { id: 'not-an-item', time_start: '2026-01-01T00:00:00Z' },
        ];
        const sessionData = { sections: [{ items: [
            { type: 'activity', activity_instance_id: 'a' }, { type: 'activity', activity_instance_id: 'b' },
        ] }] };
        expect(calculateSessionItemDuration(instances, [], sessionData)).toBe(100);
        expect(calculateSessionItemDuration(instances, [], sessionData, { nowMs: now, session: null })).toBe(160);
    });
});
