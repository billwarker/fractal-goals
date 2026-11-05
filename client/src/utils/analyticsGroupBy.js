// @ts-check
/**
 * Group-by for analytics charts: which series an activity instance (or session) belongs to.
 *
 * Tag semantics follow the goal condition evaluator: a set's effective tags are its own plus its
 * instance's; an instance's are its own. A tag dimension can be limited to one tag family. When an
 * item can belong to several series (several tags of a multi-select family, or any tag), the chart
 * must not stack them, since the stack would count the item more than once; `groupsOverlap` says
 * when.
 */

/** @typedef {'activity' | 'activityGroup' | 'tag' | 'template' | 'programDay'} GroupDimension */
/** @typedef {{ dimension: GroupDimension, familyId?: string | null }} GroupBy */
/** @typedef {{ key: string, label: string }} Group */

export const GROUP_DIMENSION_LABELS = /** @type {Record<GroupDimension, string>} */ ({
    activity: 'Activity',
    activityGroup: 'Activity group',
    tag: 'Tag',
    template: 'Session template',
    programDay: 'Program day',
});

const NONE_KEY = '__none__';

/**
 * A saved group-by, or null when there's none (or it isn't one the chart offers).
 * @param {any} value
 * @param {GroupDimension[]} [allowed]
 * @returns {GroupBy | null}
 */
export function normalizeGroupBy(value, allowed) {
    const dimension = value?.dimension;
    if (!dimension || !(dimension in GROUP_DIMENSION_LABELS)) return null;
    if (allowed && !allowed.includes(dimension)) return null;
    return dimension === 'tag' ? { dimension, familyId: value.familyId || null } : { dimension };
}

/**
 * @param {any[] | undefined} tags
 * @param {string | null | undefined} familyId
 * @returns {Group[]}
 */
function tagGroups(tags, familyId) {
    const chosen = (tags || []).filter((tag) => tag && (!familyId || tag.family_id === familyId));
    if (!chosen.length) return [{ key: NONE_KEY, label: 'Untagged' }];
    const seen = new Set();
    return chosen.filter((tag) => !seen.has(tag.id) && seen.add(tag.id)).map((tag) => ({ key: tag.id, label: tag.name }));
}

/**
 * The groups of a session (template and program day only).
 * @param {any} session
 * @param {GroupBy} groupBy
 * @returns {Group[]}
 */
export function sessionGroups(session, groupBy) {
    if (groupBy.dimension === 'template') {
        return session?.template_id
            ? [{ key: session.template_id, label: session.template_name || 'Untitled template' }]
            : [{ key: NONE_KEY, label: 'No template' }];
    }
    if (groupBy.dimension === 'programDay') {
        return session?.program_day_id
            ? [{ key: session.program_day_id, label: session.program_day_name || 'Untitled day' }]
            : [{ key: NONE_KEY, label: 'No program day' }];
    }
    return [{ key: NONE_KEY, label: 'All sessions' }];
}

/**
 * The groups of an activity instance.
 * @param {any} instance
 * @param {GroupBy} groupBy
 * @param {{ activity?: any, groupsById?: Map<string, any>, session?: any }} lookups
 * @returns {Group[]}
 */
export function instanceGroups(instance, groupBy, { activity = null, groupsById = new Map(), session = null } = {}) {
    switch (groupBy.dimension) {
        case 'activity':
            return [{ key: activity?.id || instance?.activity_definition_id || NONE_KEY, label: activity?.name || 'Unknown activity' }];
        case 'activityGroup': {
            const group = activity?.group_id ? groupsById.get(activity.group_id) : null;
            return group ? [{ key: group.id, label: group.name }] : [{ key: NONE_KEY, label: 'Ungrouped' }];
        }
        case 'tag':
            return tagGroups(instance?.tags, groupBy.familyId);
        default:
            return sessionGroups(session, groupBy);
    }
}

/**
 * The groups of one set: its own tags plus its instance's (for a tag dimension); otherwise its
 * instance's groups.
 * @param {any} set
 * @param {any} instance
 * @param {GroupBy} groupBy
 * @param {{ activity?: any, groupsById?: Map<string, any>, session?: any }} lookups
 * @returns {Group[]}
 */
export function setGroups(set, instance, groupBy, lookups = {}) {
    if (groupBy.dimension !== 'tag') return instanceGroups(instance, groupBy, lookups);
    return tagGroups([...(set?.tags || []), ...(instance?.tags || [])], groupBy.familyId);
}

/**
 * Whether one item can land in several groups, so a stack would count it twice: any tag dimension,
 * unless it's limited to a single-select family.
 * @param {GroupBy | null} groupBy
 * @param {Array<{ id: string, single_select?: boolean }>} [families]
 */
export function groupsOverlap(groupBy, families = []) {
    if (groupBy?.dimension !== 'tag') return false;
    const family = families.find((item) => item.id === groupBy.familyId);
    return !family?.single_select;
}
