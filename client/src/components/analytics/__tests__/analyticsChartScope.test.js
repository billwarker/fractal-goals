import { describe, expect, it } from 'vitest';
import { instanceMatchesScope, sessionMatchesScope } from '../analyticsGlobalFilters';
import { resolveAnalyticsChartScope } from '../analyticsChartScope';
import { createDashboardLayoutPayload, sanitizeDashboardLayoutPayload } from '../dashboardState';

const tagged = (...ids) => ({ tags: ids.map((id) => ({ id })) });
describe('global and local chart scope', () => {
    it('requires both tag clauses, including exact and untagged conflicts', () => {
        const resolved = resolveAnalyticsChartScope({ globalFilters: { tags: { tagIds: ['heavy'], match: 'all' } },
            localFilters: { tags: { tagIds: ['heavy', 'paused'], match: 'exact' } } });
        expect(instanceMatchesScope(tagged('heavy', 'paused'), {}, resolved.filters)).toBe(true);
        expect(instanceMatchesScope(tagged('heavy', 'paused', 'extra'), {}, resolved.filters)).toBe(false);
        expect(instanceMatchesScope(tagged('heavy'), {}, resolved.filters)).toBe(false);
        const conflict = resolveAnalyticsChartScope({ globalFilters: { tags: { tagIds: [], match: 'exact' } }, localFilters: { tags: { tagIds: ['heavy'], match: 'all' } } });
        expect(instanceMatchesScope(tagged('heavy'), {}, conflict.filters)).toBe(false);
        expect(instanceMatchesScope(tagged(), {}, conflict.filters)).toBe(false);
    });
    it('requires the intersection of session filters', () => {
        const resolved = resolveAnalyticsChartScope({ globalFilters: { sessions: { templateIds: ['a', 'b'] } }, localFilters: { sessions: { templateIds: ['b', 'c'] } } });
        expect(sessionMatchesScope({ template_id: 'a' }, resolved.filters)).toBe(false);
        expect(sessionMatchesScope({ template_id: 'b' }, resolved.filters)).toBe(true);
        expect(sessionMatchesScope({ template_id: 'c' }, resolved.filters)).toBe(false);
    });
    it('round-trips independent local scope and group by through saved dashboards', () => {
        const states = Object.fromEntries(['one', 'two'].map((id) => [id, { selectedCategory: 'activities', selectedVisualization: 'activityTrends',
            localFilters: { activities: { activityIds: [id] } }, visualizationState: { groupBy: { dimension: id === 'one' ? 'tag' : 'activity' } } }]));
        const payload = createDashboardLayoutPayload({ layout: { type: 'grid', panels: [{ id: 'one', x: 0, y: 0, w: 48, h: 48 }, { id: 'two', x: 48, y: 0, w: 48, h: 48 }] },
            windowStates: states, selectedWindowId: 'one', globalFilters: { tags: { tagIds: ['heavy'], match: 'all' } } });
        const saved = sanitizeDashboardLayoutPayload(payload);
        expect(saved.windowStates.one.localFilters.activities.activityIds).toEqual(['one']);
        expect(saved.windowStates.two.localFilters.activities.activityIds).toEqual(['two']);
        expect(saved.windowStates.one.visualizationState.groupBy.dimension).toBe('tag');
        expect(saved.windowStates.two.visualizationState.groupBy.dimension).toBe('activity');
        expect(saved.globalFilters.tags.tagIds).toEqual(['heavy']);
    });
});
