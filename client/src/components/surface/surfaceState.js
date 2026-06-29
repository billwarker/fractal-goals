/**
 * Serialization + normalization helpers for the configurable page surface.
 *
 * Mirrors analytics' dashboardState.js, but the surface payload is simpler:
 * panels carry a `kind` ('tree' | 'widget') via `panel_contents`, and the
 * goal-detail view is NOT persisted — only a placement `detail_panel` hint is.
 */

import {
    GRID_COLUMNS,
    GRID_ROWS,
    MIN_PANEL_W,
    MIN_PANEL_H,
    migrateSplitLayoutToGrid,
    normalizeGridLayout,
    rescaleGridLayout,
} from './gridLayout/GridLayout';

export const SURFACE_VERSION = 1;
export const SURFACE_VIEW_MODES = ['overview', 'scoped'];

const WIDGET_TYPES = new Set(['analytics', 'calendar', 'lastSession', 'metricCard']);

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBounds(bounds) {
    const columns = Math.round(Number(bounds?.columns));
    const rows = Math.round(Number(bounds?.rows));
    return {
        columns: Number.isFinite(columns) && columns > 0 ? columns : GRID_COLUMNS,
        rows: Number.isFinite(rows) && rows > 0 ? rows : GRID_ROWS,
    };
}

function normalizeDetailHint(hint) {
    if (hint === 'fullscreen' || hint === 'auto') return hint;
    if (isPlainObject(hint)) {
        const out = {};
        for (const axis of ['x', 'y', 'w', 'h']) {
            const v = Math.round(Number(hint[axis]));
            if (!Number.isFinite(v)) return 'auto';
            out[axis] = v;
        }
        return out;
    }
    return 'auto';
}

export const DEFAULT_TREE_VIEW = {
    mode: 'tree',
    fadeInactiveBranches: false,
    hideInactiveGoals: false,
    hideCompletedGoals: false,
    showMetricsOverlay: false,
};

function normalizeTreeView(treeView, { mobile = false } = {}) {
    const base = { ...DEFAULT_TREE_VIEW, ...(isPlainObject(treeView) ? treeView : {}) };
    if (!isPlainObject(treeView) || treeView.mode === undefined) {
        base.mode = mobile ? 'hierarchy' : 'tree';
    }
    if (base.mode !== 'tree' && base.mode !== 'hierarchy') {
        base.mode = mobile ? 'hierarchy' : 'tree';
    }
    return base;
}

/**
 * Default surface: one tree panel filling the whole grid (looks like today).
 */
export function getDefaultSurfaceConfig({ mobile = false, treeId = 'tree-1' } = {}) {
    const view = {
        layout: { type: 'grid', panels: [{ id: treeId, x: 0, y: 0, w: GRID_COLUMNS, h: GRID_ROWS }] },
        layout_bounds: { columns: GRID_COLUMNS, rows: GRID_ROWS },
        panel_contents: {
            [treeId]: { kind: 'tree', treeView: normalizeTreeView(null, { mobile }) },
        },
    };
    return {
        version: SURFACE_VERSION,
        ...view,
        detail_panel: mobile ? 'fullscreen' : 'auto',
        view_configs: {
            overview: view,
            scoped: {
                layout: { type: 'grid', panels: [{ id: treeId, x: 0, y: 0, w: GRID_COLUMNS, h: GRID_ROWS }] },
                layout_bounds: { columns: GRID_COLUMNS, rows: GRID_ROWS },
                panel_contents: {
                    [treeId]: { kind: 'tree', treeView: normalizeTreeView(null, { mobile }) },
                },
            },
        },
    };
}

function normalizePanelContent(content, { mobile = false } = {}) {
    if (!isPlainObject(content)) return null;
    if (content.kind === 'tree') {
        return { kind: 'tree', treeView: normalizeTreeView(content.treeView, { mobile }) };
    }
    if (content.kind === 'widget') {
        if (!WIDGET_TYPES.has(content.widgetType)) return null;
        return {
            kind: 'widget',
            widgetType: content.widgetType,
            state: isPlainObject(content.state) ? content.state : {},
        };
    }
    return null;
}

function cloneViewConfig(view) {
    return {
        layout: {
            type: 'grid',
            panels: view.layout.panels.map((panel) => ({ ...panel })),
        },
        layout_bounds: { ...view.layout_bounds },
        panel_contents: Object.fromEntries(
            Object.entries(view.panel_contents).map(([id, content]) => [
                id,
                content.kind === 'tree'
                    ? { kind: 'tree', treeView: { ...content.treeView } }
                    : { kind: 'widget', widgetType: content.widgetType, state: { ...content.state } },
            ])
        ),
    };
}

function normalizeSurfaceViewConfig(config, { mobile = false } = {}) {
    if (!isPlainObject(config)) return null;
    const grid = normalizeGridLayout(migrateSplitLayoutToGrid(config.layout));
    if (!grid || !grid.panels.length) return null;

    const panelIds = grid.panels.map((p) => p.id);
    const rawContents = isPlainObject(config.panel_contents) ? config.panel_contents : {};

    const panelContents = {};
    let treeCount = 0;
    for (const id of panelIds) {
        const normalized = normalizePanelContent(rawContents[id], { mobile });
        if (!normalized) return null;
        if (normalized.kind === 'tree') treeCount += 1;
        panelContents[id] = normalized;
    }
    if (treeCount !== 1) return null;

    return {
        layout: grid,
        layout_bounds: config.layout_bounds ? normalizeBounds(config.layout_bounds) : { ...normalizeBounds(null) },
        panel_contents: panelContents,
    };
}

function buildTreeOnlyViewFrom(view, { mobile = false } = {}) {
    const treeId = getTreePanelId(view?.panel_contents) || 'tree-1';
    const treeView = view?.panel_contents?.[treeId]?.treeView;
    return {
        layout: { type: 'grid', panels: [{ id: treeId, x: 0, y: 0, w: GRID_COLUMNS, h: GRID_ROWS }] },
        layout_bounds: { columns: GRID_COLUMNS, rows: GRID_ROWS },
        panel_contents: {
            [treeId]: {
                kind: 'tree',
                treeView: normalizeTreeView(treeView, { mobile }),
            },
        },
    };
}

/**
 * Validate + normalize a stored config; returns null if unusable so callers
 * fall back to the default surface.
 */
export function sanitizeSurfaceConfig(config, { mobile = false } = {}) {
    if (!isPlainObject(config)) return null;
    const legacyView = normalizeSurfaceViewConfig(config, { mobile });
    const rawViews = isPlainObject(config.view_configs) ? config.view_configs : null;
    const overviewView = normalizeSurfaceViewConfig(rawViews?.overview, { mobile }) || legacyView;
    if (!overviewView) return null;
    const scopedView = normalizeSurfaceViewConfig(rawViews?.scoped, { mobile })
        || buildTreeOnlyViewFrom(overviewView, { mobile });
    const activeViewMode = SURFACE_VIEW_MODES.includes(config.active_view_mode)
        ? config.active_view_mode
        : 'overview';
    const activeView = activeViewMode === 'scoped' ? scopedView : overviewView;

    return {
        version: SURFACE_VERSION,
        ...cloneViewConfig(activeView),
        detail_panel: normalizeDetailHint(config.detail_panel),
        active_view_mode: activeViewMode,
        view_configs: {
            overview: cloneViewConfig(overviewView),
            scoped: cloneViewConfig(scopedView),
        },
    };
}

/**
 * Build a persistable config payload from live surface state.
 */
export function createSurfaceConfigPayload({ layout, panelContents, detailPanel, layoutBounds }, { mobile = false } = {}) {
    const grid = normalizeGridLayout(migrateSplitLayoutToGrid(layout))
        || getDefaultSurfaceConfig({ mobile }).layout;
    const ids = grid.panels.map((p) => p.id);
    const contents = {};
    let treeCount = 0;
    for (const id of ids) {
        const normalized = normalizePanelContent(panelContents?.[id], { mobile });
        if (normalized) {
            if (normalized.kind === 'tree') treeCount += 1;
            contents[id] = normalized;
        }
    }
    // Guarantee the exactly-one-tree invariant the backend enforces.
    if (treeCount === 0 && ids.length) {
        contents[ids[0]] = { kind: 'tree', treeView: normalizeTreeView(null, { mobile }) };
    }
    const view = {
        layout: grid,
        layout_bounds: normalizeBounds(layoutBounds),
        panel_contents: contents,
    };
    return {
        version: SURFACE_VERSION,
        ...cloneViewConfig(view),
        detail_panel: normalizeDetailHint(detailPanel),
        active_view_mode: 'overview',
        view_configs: {
            overview: cloneViewConfig(view),
            scoped: buildTreeOnlyViewFrom(view, { mobile }),
        },
    };
}

export function getSurfaceModeConfig(config, mode = 'overview', { mobile = false } = {}) {
    const sanitized = sanitizeSurfaceConfig(config, { mobile }) || getDefaultSurfaceConfig({ mobile });
    const viewMode = SURFACE_VIEW_MODES.includes(mode) ? mode : 'overview';
    const view = sanitized.view_configs?.[viewMode] || sanitized.view_configs?.overview || sanitized;
    return {
        ...sanitized,
        ...cloneViewConfig(view),
        active_view_mode: viewMode,
    };
}

export function updateSurfaceModeConfig(config, mode, nextModeConfig, { mobile = false } = {}) {
    const sanitized = sanitizeSurfaceConfig(config, { mobile }) || getDefaultSurfaceConfig({ mobile });
    const viewMode = SURFACE_VIEW_MODES.includes(mode) ? mode : 'overview';
    const normalizedNext = normalizeSurfaceViewConfig(nextModeConfig, { mobile });
    if (!normalizedNext) return sanitized;
    const viewConfigs = {
        overview: cloneViewConfig(sanitized.view_configs.overview),
        scoped: cloneViewConfig(sanitized.view_configs.scoped),
        [viewMode]: cloneViewConfig(normalizedNext),
    };
    const activeView = viewConfigs[viewMode];
    return {
        ...sanitized,
        ...cloneViewConfig(activeView),
        active_view_mode: viewMode,
        detail_panel: normalizeDetailHint(nextModeConfig.detail_panel ?? sanitized.detail_panel),
        view_configs: viewConfigs,
    };
}

/**
 * Rescale a saved config's grid into the current live bounds, so a surface
 * saved at one resolution restores proportionally at another. Mirrors
 * analytics' fitLayoutToCurrentBounds.
 */
export function fitConfigToBounds(config, currentBounds) {
    if (!config || !currentBounds) return config;
    const savedBounds = normalizeBounds(config.layout_bounds);
    const next = normalizeBounds(currentBounds);
    if (savedBounds.columns === next.columns && savedBounds.rows === next.rows) return config;
    const fitted = {
        ...config,
        layout: rescaleGridLayout(config.layout, savedBounds, next),
        layout_bounds: next,
    };
    if (!isPlainObject(config.view_configs)) return fitted;
    return {
        ...fitted,
        view_configs: Object.fromEntries(
            Object.entries(config.view_configs).map(([mode, view]) => {
                const viewBounds = normalizeBounds(view.layout_bounds);
                return [
                    mode,
                    {
                        ...view,
                        layout: rescaleGridLayout(view.layout, viewBounds, next),
                        layout_bounds: next,
                    },
                ];
            })
        ),
    };
}

/**
 * Derive a sensible mobile config from a desktop config by stacking every
 * panel into a single full-width column (sorted by y, then x). The tree panel
 * keeps hierarchy mode; detail becomes a fullscreen overlay.
 */
export function seedMobileFromDesktop(desktopConfig, { columns = GRID_COLUMNS } = {}) {
    const sanitized = sanitizeSurfaceConfig(desktopConfig) || getDefaultSurfaceConfig();
    const buildMobileView = (view) => {
        const ordered = [...view.layout.panels].sort((a, b) => (a.y - b.y) || (a.x - b.x));

        let y = 0;
        const panels = [];
        const panelContents = {};
        for (const panel of ordered) {
            const content = view.panel_contents[panel.id];
            const h = Math.max(MIN_PANEL_H, Math.round(panel.h));
            panels.push({ id: panel.id, x: 0, y, w: Math.max(MIN_PANEL_W, columns), h });
            if (content?.kind === 'tree') {
                panelContents[panel.id] = {
                    kind: 'tree',
                    treeView: { ...normalizeTreeView(content.treeView, { mobile: true }), mode: 'hierarchy' },
                };
            } else {
                panelContents[panel.id] = content;
            }
            y += h;
        }
        return {
            layout: { type: 'grid', panels },
            layout_bounds: { columns, rows: Math.max(MIN_PANEL_H, y) },
            panel_contents: panelContents,
        };
    };
    const overview = buildMobileView(sanitized.view_configs.overview);
    const scoped = buildMobileView(sanitized.view_configs.scoped);

    return {
        version: SURFACE_VERSION,
        ...cloneViewConfig(overview),
        detail_panel: 'fullscreen',
        active_view_mode: 'overview',
        view_configs: {
            overview: cloneViewConfig(overview),
            scoped: cloneViewConfig(scoped),
        },
    };
}

export function getHighestPanelIndex(layout) {
    const grid = migrateSplitLayoutToGrid(layout);
    const ids = grid?.panels.map((p) => p.id) || [];
    return ids.reduce((max, id) => {
        const match = /^(?:panel|widget)-(\d+)$/.exec(id);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
}

export function generatePanelId(index) {
    return `panel-${index}`;
}

/** The id of the single tree panel in a config, or null. */
export function getTreePanelId(panelContents) {
    if (!isPlainObject(panelContents)) return null;
    const entry = Object.entries(panelContents).find(([, c]) => c?.kind === 'tree');
    return entry ? entry[0] : null;
}
