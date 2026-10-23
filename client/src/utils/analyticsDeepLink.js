// Opening the Analytics page pre-configured: one activity chart plus tag, session template and
// program day filters. The Progress pane builds these links; Analytics reads them once on load.

export const ANALYTICS_LINK_PARAMS = ['activity', 'viz', 'metrics', 'tags', 'tagMatch', 'template', 'programDay'];

const list = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

/**
 * @param {string} rootId
 * @param {{ activityId: string, viz?: string, metricIds?: string[], tagIds?: string[] | null,
 *   tagMatch?: 'all'|'exact', templateId?: string|null, programDayId?: string|null }} link
 *   ``tagIds: null`` means no tag filter; ``[]`` with exact match means untagged sessions.
 */
export function buildAnalyticsLink(rootId, {
    activityId, viz = 'metricTrends', metricIds = [], tagIds = null, tagMatch = 'exact', templateId = null, programDayId = null,
}) {
    const params = new URLSearchParams({ activity: activityId, viz });
    if (metricIds.length) params.set('metrics', metricIds.join(','));
    if (tagIds !== null) {
        params.set('tags', tagIds.join(','));
        params.set('tagMatch', tagMatch);
    }
    if (templateId) params.set('template', templateId);
    if (programDayId) params.set('programDay', programDayId);
    return `/${rootId}/analytics?${params.toString()}`;
}

/** The link's settings, or null when the URL carries none. */
export function parseAnalyticsLink(searchParams) {
    const activityId = searchParams.get('activity');
    if (!activityId) return null;
    const hasTags = searchParams.has('tags');
    return {
        activityId,
        viz: searchParams.get('viz') || 'metricTrends',
        metricIds: list(searchParams.get('metrics')),
        tags: hasTags ? { tagIds: list(searchParams.get('tags')), match: searchParams.get('tagMatch') === 'all' ? 'all' : 'exact' } : null,
        templateIds: list(searchParams.get('template')),
        programDayIds: list(searchParams.get('programDay')),
    };
}
