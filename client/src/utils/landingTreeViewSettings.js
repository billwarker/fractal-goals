export const DEFAULT_LANDING_TREE_VIEW_SETTINGS = Object.freeze({
    fadeInactiveBranches: false,
    hideInactiveGoals: false,
    hideCompletedGoals: false,
    showMetricsOverlay: false,
});

export const LANDING_TREE_VIEW_SETTING_OPTIONS = Object.freeze([
    Object.freeze({ key: 'fadeInactiveBranches', label: 'Fade inactive branches' }),
    Object.freeze({ key: 'hideInactiveGoals', label: 'Hide inactive goals' }),
    Object.freeze({ key: 'hideCompletedGoals', label: 'Hide completed goals' }),
    Object.freeze({ key: 'showMetricsOverlay', label: 'Show metrics overlay' }),
]);

export function normalizeLandingTreeViewSettings(settings) {
    return Object.fromEntries(
        LANDING_TREE_VIEW_SETTING_OPTIONS.map(({ key }) => [key, settings?.[key] === true])
    );
}
