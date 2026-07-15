import { describe, expect, it } from 'vitest';

import { selectTargetAnalyticsData } from '../targetAnalyticsSnapshot';

describe('selectTargetAnalyticsData', () => {
    it('filters the published history and summary to target creation', () => {
        const snapshot = {
            target: { created_at: '2026-06-01T00:00:00Z' },
            instances: [
                { id: 'before', session_date: '2026-05-01T00:00:00Z' },
                { id: 'after', session_date: '2026-07-01T00:00:00Z' },
            ],
            summary: { total_count: 2, last_instance_at: '2026-07-01T00:00:00Z' },
        };

        const result = selectTargetAnalyticsData(snapshot, null, false);

        expect(result.instances.map((instance) => instance.id)).toEqual(['after']);
        expect(result.summary.total_count).toBe(1);
    });
});
