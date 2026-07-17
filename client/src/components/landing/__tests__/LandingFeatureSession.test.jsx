import { describe, expect, it } from 'vitest';

import { buildSections, resolveSessionTargetAnalytics } from '../LandingFeatureSession';

describe('LandingFeatureSession section adapter', () => {
    it('loads configured session instances when published section membership is stale', () => {
        const sections = buildSections({
            attributes: {
                session_data: {
                    sections: [{ id: 'section-1', name: 'Exercises', activity_ids: ['stale-id'] }],
                },
            },
            activity_instances: [
                { id: 'instance-1', activity_definition_id: 'activity-1' },
            ],
        });

        expect(sections).toEqual([
            expect.objectContaining({
                id: 'section-1',
                name: 'Exercises',
                activity_ids: ['instance-1'],
            }),
        ]);
    });

    it('resolves published target analytics for the session side pane', () => {
        const target = { id: 'target-1', activity_id: 'activity-1' };
        const published = { target, instances: [{ id: 'published-instance' }] };

        expect(resolveSessionTargetAnalytics({
            targetAnalytics: { 'target-1': published },
            analyticsActivityInstances: { 'activity-1': [{ id: 'legacy-instance' }] },
        }, [], target)).toBe(published);
    });

    it('falls back to legacy activity history when target analytics were not published', () => {
        const target = { id: 'target-1', activity_id: 'activity-1' };
        const activity = { id: 'activity-1', name: 'Pull Up' };
        const older = { id: 'older', session_date: '2026-07-01T00:00:00Z' };
        const newer = { id: 'newer', session_date: '2026-07-02T00:00:00Z' };

        const resolved = resolveSessionTargetAnalytics({
            analyticsActivityInstances: { 'activity-1': [newer, older] },
        }, [activity], target);

        expect(resolved.activity_definition).toBe(activity);
        expect(resolved.instances).toEqual([older, newer]);
        expect(resolved.summary.total_count).toBe(2);
    });
});
