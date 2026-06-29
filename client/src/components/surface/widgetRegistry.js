/**
 * Surface widget registry. Mirrors the analytics visualization registry shape
 * so widget types are added declaratively. Each definition describes default
 * grid geometry (in cells) and default persisted state. The actual React
 * components are wired in SurfaceWidget to keep this module import-light.
 * Widgets spawn at their minimum footprint, then can be resized on the grid.
 */

export const SURFACE_WIDGETS = [
    {
        type: 'analytics',
        name: 'Analytics Panel',
        description: 'A saved analytics view or chart.',
        minW: 24,
        minH: 16,
        defaultState: { savedViewId: null, category: null, visualization: null },
    },
    {
        type: 'calendar',
        name: 'Calendar',
        description: 'Monthly or weekly program calendar.',
        minW: 22,
        minH: 16,
        defaultState: { grain: 'month' },
    },
    {
        type: 'lastSession',
        name: 'Last Session',
        description: 'Your most recent session at a glance.',
        minW: 24,
        minH: 18,
        defaultState: {},
    },
    {
        type: 'metricCard',
        name: 'Metric Card',
        description: 'A single goal-surface metric.',
        minW: 18,
        minH: 10,
        defaultState: { metricKey: 'recentSessionsCount' },
    },
];

const BY_TYPE = new Map(SURFACE_WIDGETS.map((w) => [w.type, w]));

const FALLBACK = {
    type: 'unknown',
    name: 'Widget',
    description: '',
    minW: 24,
    minH: 12,
    defaultState: {},
};

export function getWidgetDefinition(type) {
    return BY_TYPE.get(type) || FALLBACK;
}

export function listWidgetDefinitions() {
    return SURFACE_WIDGETS;
}

export function getWidgetMinimumSize(type) {
    const def = getWidgetDefinition(type);
    return {
        w: def.minW || def.defaultW || FALLBACK.minW,
        h: def.minH || def.defaultH || FALLBACK.minH,
    };
}
