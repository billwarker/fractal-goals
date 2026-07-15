import { flattenGoalTree } from '../../utils/goalNodeModel';

// Resolution helpers for the landing Features section. Each helper honors the
// admin-published `showcase` selections (schema v6+) and falls back to sensible
// auto-derived picks for older snapshots where `showcase` is null.

const getShowcase = (example) => example?.showcase || {};

export function resolveFeaturedSession(example) {
    const sessions = example?.sessions || [];
    const featuredId = getShowcase(example).session_id;
    if (featuredId) {
        const featured = sessions.find((session) => String(session.id) === String(featuredId));
        if (featured) return featured;
    }
    return sessions[0] || null;
}

const activityHasGoalLinks = (activity, goalLinkedActivityIds) => (
    (activity.associated_goal_ids || []).length > 0
    || goalLinkedActivityIds.has(String(activity.id))
);

export function resolveFeaturedActivity(example) {
    const definitions = example?.activityDefinitions || [];
    const featuredIds = getShowcase(example).activity_ids || [];
    if (featuredIds.length > 0) {
        const byId = new Map(definitions.map((definition) => [String(definition.id), definition]));
        const featured = featuredIds.map((activityId) => byId.get(String(activityId))).find(Boolean);
        if (featured) return featured;
    }
    // v4 fallback: prefer activities that can demonstrate goal inheritance.
    const goalLinkedActivityIds = new Set(
        flattenGoalTree(example?.tree)
            .flatMap((goal) => goal.attributes?.associated_activity_ids || [])
            .map(String)
    );
    const withLinks = definitions.filter((activity) => activityHasGoalLinks(activity, goalLinkedActivityIds));
    return (withLinks.length > 0 ? withLinks : definitions)[0] || null;
}

export function resolveFeaturedProgram(example) {
    const programs = example?.programs || [];
    const showcase = getShowcase(example);
    let program = programs[0] || null;
    if (showcase.program_id) {
        program = programs.find((item) => String(item.id) === String(showcase.program_id)) || program;
    }
    return {
        program,
        windowStart: showcase.program_start_date || null,
        windowEnd: showcase.program_end_date || null,
    };
}

export function resolveFeaturedAnalyticsViews(example) {
    const views = example?.analyticsViews || [];
    const featuredIds = getShowcase(example).analytics_view_ids || [];
    if (featuredIds.length === 0) return views.slice(0, 3);
    const byId = new Map(views.map((view) => [String(view.id), view]));
    const featured = featuredIds
        .map((viewId) => byId.get(String(viewId)))
        .filter(Boolean);
    return (featured.length > 0 ? featured : views).slice(0, 3);
}

// Compare YYYY-MM-DD-prefixed date strings; ISO date(-time) strings sort
// lexicographically within the same format, which is all the clipping needs.
const toDatePart = (value) => (typeof value === 'string' ? value.slice(0, 10) : null);

export function overlapsDateWindow(start, end, windowStart, windowEnd) {
    if (!windowStart && !windowEnd) return true;
    const startPart = toDatePart(start) || toDatePart(end);
    const endPart = toDatePart(end) || toDatePart(start);
    if (!startPart) return true;
    if (windowEnd && startPart > windowEnd) return false;
    if (windowStart && endPart < windowStart) return false;
    return true;
}

// Build the flat node list for GoalHierarchyList showing one activity's goal
// inheritance: the goals the activity is linked to plus their full ancestor
// lineage up to the root.
export function buildActivityLineage(tree, activity) {
    const flattened = flattenGoalTree(tree);
    if (flattened.length === 0 || !activity) {
        return { nodes: [], targetIds: new Set(), ancestorIds: new Set() };
    }

    const activityId = String(activity.id);
    const targetIds = new Set();
    flattened.forEach((goal) => {
        const linkedIds = (goal.attributes?.associated_activity_ids || []).map(String);
        const linkedActivities = (goal.attributes?.associated_activities || []).map((item) => String(item.id));
        if (linkedIds.includes(activityId) || linkedActivities.includes(activityId)) {
            targetIds.add(String(goal.id));
        }
    });
    // Snapshot activity definitions also carry the reverse mapping.
    (activity.associated_goal_ids || []).forEach((goalId) => {
        targetIds.add(String(goalId));
    });

    const knownIds = new Set(flattened.map((goal) => String(goal.id)));
    [...targetIds].forEach((goalId) => {
        if (!knownIds.has(goalId)) targetIds.delete(goalId);
    });

    const parentMap = new Map();
    flattened.forEach((goal) => {
        if (goal.parent_id) parentMap.set(String(goal.id), String(goal.parent_id));
    });

    const ancestorIds = new Set();
    targetIds.forEach((goalId) => {
        let currentId = parentMap.get(goalId);
        const visited = new Set([goalId]);
        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            if (!targetIds.has(currentId)) ancestorIds.add(currentId);
            currentId = parentMap.get(currentId);
        }
    });

    const lineageIds = new Set([...targetIds, ...ancestorIds]);
    const nodes = flattened.filter((goal) => lineageIds.has(String(goal.id)));
    return { nodes, targetIds, ancestorIds };
}
