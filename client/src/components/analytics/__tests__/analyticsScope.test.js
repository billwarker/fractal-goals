import { buildAnalyticsLink, parseAnalyticsLink } from '../../../utils/analyticsDeepLink';
import { instanceMatchesScope, normalizeGlobalFilters, sessionMatchesScope } from '../analyticsGlobalFilters';
import { analyticsStateFromLink } from '../useAnalyticsDeepLink';

const tagged = (...ids) => ({ tags: ids.map((id) => ({ id })) });

describe('analytics tag and session scope', () => {
    it('round-trips a Progress pane link into one panel and matching filters', () => {
        const href = buildAnalyticsLink('root-1', {
            activityId: 'act', metricIds: ['m1', 'm2'], tagIds: ['heavy'], templateId: 'tpl', programDayId: 'day',
        });
        const link = parseAnalyticsLink(new URLSearchParams(href.split('?')[1]));
        const { windowState, globalFilters } = analyticsStateFromLink(link, { id: 'act', name: 'Squat' });
        expect(windowState).toMatchObject({
            selectedCategory: 'activities',
            selectedVisualization: 'metricTrends',
            selectedActivity: { id: 'act' },
            visualizationState: expect.objectContaining({ metrics: ['m1', 'm2'] }),
        });
        expect(globalFilters.tags).toEqual({ tagIds: ['heavy'], match: 'exact' });
        expect(globalFilters.sessions).toEqual({ templateIds: ['tpl'], programDayIds: ['day'] });
        expect(parseAnalyticsLink(new URLSearchParams(''))).toBeNull();
        // All history: no tag filter at all.
        expect(parseAnalyticsLink(new URLSearchParams(buildAnalyticsLink('r', { activityId: 'act' }).split('?')[1])).tags).toBeNull();
    });

    it('matches every chosen tag, or exactly the chosen set (none chosen = untagged)', () => {
        const all = { tags: { tagIds: ['a'], match: 'all' } };
        const exact = { tags: { tagIds: ['a'], match: 'exact' } };
        const untagged = { tags: { tagIds: [], match: 'exact' } };
        expect(instanceMatchesScope(tagged('a', 'b'), {}, all)).toBe(true);
        expect(instanceMatchesScope(tagged('a', 'b'), {}, exact)).toBe(false);
        expect(instanceMatchesScope(tagged('a'), {}, exact)).toBe(true);
        expect(instanceMatchesScope(tagged(), {}, untagged)).toBe(true);
        expect(instanceMatchesScope(tagged('a'), {}, untagged)).toBe(false);
        expect(instanceMatchesScope(tagged('z'), {}, {})).toBe(true);
    });

    it('matches session templates and program days, and normalizes unknown shapes away', () => {
        const filters = { sessions: { templateIds: ['tpl'], programDayIds: ['day'] } };
        expect(sessionMatchesScope({ template_id: 'tpl', program_day_id: 'day' }, filters)).toBe(true);
        expect(sessionMatchesScope({ template_id: 'tpl', program_day_id: null }, filters)).toBe(false);
        expect(instanceMatchesScope(tagged(), undefined, filters)).toBe(false);
        expect(normalizeGlobalFilters({ tags: 'bad', sessions: { templateIds: ['x', 'x', null] } })).toMatchObject({
            tags: null, sessions: { templateIds: ['x'], programDayIds: [] },
        });
    });
});
