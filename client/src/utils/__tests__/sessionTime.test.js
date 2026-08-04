import { describe, expect, it } from 'vitest';

import {
    calculateSectionDurationFromInstanceIds,
    calculateSessionItemDuration,
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
