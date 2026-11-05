import { hasActiveGlobalFilters, resolveAnalyticsGlobalFilters } from './analyticsGlobalFilters';

const intersect = (left, right) => new Set([...left].filter((id) => right.has(id)));

/** Global and chart scopes are conjunctive, including independently selected tag match rules. */
export function resolveAnalyticsChartScope({ globalFilters, localFilters, ...data }) {
    const global = resolveAnalyticsGlobalFilters({ ...data, filters: globalFilters });
    if (!hasActiveGlobalFilters(localFilters)) return global;
    const local = resolveAnalyticsGlobalFilters({ ...data, filters: localFilters });
    const activityIds = global.hasActivityFilter && local.hasActivityFilter
        ? intersect(global.activityIds, local.activityIds) : (local.activityIds || global.activityIds);
    const goalIds = global.hasGoalFilter && local.hasGoalFilter
        ? intersect(global.goalIds, local.goalIds) : (local.hasGoalFilter ? local.goalIds : global.goalIds);
    const sessionIds = new Set();
    if (activityIds) Object.entries(data.activityInstances || {}).forEach(([id, instances]) => {
        if (activityIds.has(id)) instances.forEach((instance) => { if (instance.session_id) sessionIds.add(instance.session_id); });
    });
    const tags = [global.filters.tags, local.filters.tags].filter(Boolean);
    const exact = tags.find((tag) => tag.match === 'exact');
    return {
        filters: {
            ...global.filters,
            goals: local.hasGoalFilter ? local.filters.goals : global.filters.goals,
            tags: exact || (tags.length ? { match: 'all', tagIds: [...new Set(tags.flatMap((tag) => tag.tagIds))] } : null),
            sessions: {
                templateIds: [...new Set([...global.filters.sessions.templateIds, ...local.filters.sessions.templateIds])],
                programDayIds: [...new Set([...global.filters.sessions.programDayIds, ...local.filters.sessions.programDayIds])],
            },
            clauses: [global.filters, local.filters],
        },
        goalIds, activityIds, sessionIds,
        hasGoalFilter: global.hasGoalFilter || local.hasGoalFilter,
        hasActivityFilter: global.hasActivityFilter || local.hasActivityFilter,
    };
}
