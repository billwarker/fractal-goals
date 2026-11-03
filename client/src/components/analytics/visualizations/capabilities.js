// @ts-check
/**
 * Which filters each chart uses. "core" filters always show; "optional" ones are
 * offered under "Add filters" and show once added (saved in the chart's state as `shownFilters`) or
 * while set. A filter a chart doesn't use is never offered for it.
 *
 * What a filter reaches follows analyticsGlobalFilters.js: goals and activities resolve to
 * activities and so narrow every chart; tags filter activity instances (activity charts); session
 * template and program day filter sessions (session and activity charts). Goal charts are read on
 * the server, which takes the range and activities only.
 */

/** @typedef {'timeRange' | 'goals' | 'activities' | 'tags' | 'templates' | 'programDays'} FilterId */
/** @typedef {{ core: FilterId[], optional: FilterId[] }} FilterCapabilities */

/** Every filter, in the order the pane lists them. */
export const FILTER_ORDER = /** @type {FilterId[]} */ (['timeRange', 'goals', 'activities', 'tags', 'templates', 'programDays']);

export const FILTER_LABELS = /** @type {Record<FilterId, string>} */ ({
    timeRange: 'Time range',
    goals: 'Goals',
    activities: 'Activities',
    tags: 'Tags',
    templates: 'Session template',
    programDays: 'Program day',
});

/** @type {Record<string, FilterCapabilities>} */
// Every filter, including the time range, is opt-in or shown while active.
const CATEGORY_FILTERS = {
    goals: { core: [], optional: ['timeRange', 'goals', 'activities'] },
    sessions: { core: [], optional: ['timeRange', 'goals', 'activities', 'templates', 'programDays'] },
    activities: { core: [], optional: ['timeRange', 'goals', 'activities', 'tags', 'templates', 'programDays'] },
};

/** @type {FilterCapabilities} */
const ALL_FILTERS = { core: [], optional: FILTER_ORDER };

/**
 * A chart's filters: its own declaration (`capabilities.filters` on the registry entry), else its
 * category's. Without a category, every filter (nothing is known to be unused).
 * @param {string | null | undefined} category
 * @param {any} [visualization] the registry entry, if known
 * @returns {FilterCapabilities}
 */
export function getFilterCapabilities(category, visualization = null) {
    return visualization?.capabilities?.filters || (category && CATEGORY_FILTERS[category]) || ALL_FILTERS;
}

/** @param {FilterCapabilities} capabilities */
export const appliedFilters = (capabilities) => new Set([...capabilities.core, ...capabilities.optional]);

/**
 * The filters that are set.
 * @param {any} filters normalized global filters
 * @param {{ start?: string | null, end?: string | null } | null | undefined} dateRange
 * @returns {FilterId[]}
 */
export function activeFilterIds(filters, dateRange) {
    const active = {
        timeRange: Boolean(dateRange?.start || dateRange?.end),
        goals: filters.goals.goalIds.length > 0,
        activities: filters.activities.activityIds.length > 0 || filters.activities.groupIds.length > 0,
        tags: Boolean(filters.tags),
        templates: filters.sessions.templateIds.length > 0,
        programDays: filters.sessions.programDayIds.length > 0,
    };
    return FILTER_ORDER.filter((id) => active[id]);
}

/**
 * The pane's filters while no chart is selected: the open charts' core filters, with the others
 * they can use as optional; with no charts open, the page defaults.
 * @param {FilterCapabilities[]} openPanels
 * @returns {FilterCapabilities}
 */
export function pageFilterCapabilities(openPanels) {
    if (!openPanels.length) return ALL_FILTERS;
    const core = FILTER_ORDER.filter((id) => openPanels.some((panel) => panel.core.includes(id)));
    const optional = FILTER_ORDER.filter((id) => !core.includes(id) && openPanels.some((panel) => appliedFilters(panel).has(id)));
    return { core, optional };
}

/**
 * The filter sections to show and the ones "Add filter" offers: the chart's (or, with none
 * selected, the page's) core filters, the ones added, the other open charts' core filters (they
 * share the global filters), and any that are set.
 *
 * @param {{
 *   selected: FilterCapabilities | null,
 *   shownFilters?: string[],
 *   openPanels: FilterCapabilities[],
 *   active: FilterId[],
 * }} input
 * @returns {{ visible: FilterId[], addable: FilterId[], optional: FilterId[] }}
 */
export function filterSections({ selected, shownFilters = [], openPanels, active }) {
    const own = selected || pageFilterCapabilities(openPanels);
    const visible = new Set(active);
    own.core.forEach((id) => visible.add(id));
    shownFilters.forEach((id) => {
        if (own.optional.includes(/** @type {FilterId} */ (id))) visible.add(/** @type {FilterId} */ (id));
    });
    openPanels.forEach((panel) => panel.core.forEach((id) => visible.add(id)));
    return {
        visible: FILTER_ORDER.filter((id) => visible.has(id)),
        addable: FILTER_ORDER.filter((id) => own.optional.includes(id) && !visible.has(id)),
        optional: own.optional,
    };
}
