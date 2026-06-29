import { describe, expect, it } from 'vitest';

import {
    SURFACE_VERSION,
    createSurfaceConfigPayload,
    fitConfigToBounds,
    getDefaultSurfaceConfig,
    getSurfaceModeConfig,
    getTreePanelId,
    sanitizeSurfaceConfig,
    seedMobileFromDesktop,
    updateSurfaceModeConfig,
} from '../surfaceState';

describe('getDefaultSurfaceConfig', () => {
    it('produces a single full-grid tree panel', () => {
        const config = getDefaultSurfaceConfig();
        expect(config.version).toBe(SURFACE_VERSION);
        expect(config.layout.panels).toHaveLength(1);
        const [panel] = config.layout.panels;
        expect(panel.x).toBe(0);
        expect(panel.y).toBe(0);
        expect(config.panel_contents[panel.id].kind).toBe('tree');
        expect(config.detail_panel).toBe('auto');
    });

    it('defaults mobile tree to hierarchy mode + fullscreen detail', () => {
        const config = getDefaultSurfaceConfig({ mobile: true });
        const treeId = getTreePanelId(config.panel_contents);
        expect(config.panel_contents[treeId].treeView.mode).toBe('hierarchy');
        expect(config.detail_panel).toBe('fullscreen');
    });
});

describe('sanitize/create round trip', () => {
    it('round-trips a valid config with a widget', () => {
        const built = createSurfaceConfigPayload({
            layout: {
                type: 'grid',
                panels: [
                    { id: 'tree-1', x: 0, y: 0, w: 48, h: 48 },
                    { id: 'panel-2', x: 48, y: 0, w: 24, h: 12 },
                ],
            },
            panelContents: {
                'tree-1': { kind: 'tree', treeView: { mode: 'tree' } },
                'panel-2': { kind: 'widget', widgetType: 'calendar', state: { grain: 'week' } },
            },
            detailPanel: 'auto',
            layoutBounds: { columns: 96, rows: 48 },
        });

        const sanitized = sanitizeSurfaceConfig(built);
        expect(sanitized).not.toBeNull();
        expect(getTreePanelId(sanitized.panel_contents)).toBe('tree-1');
        expect(sanitized.panel_contents['panel-2'].widgetType).toBe('calendar');
        expect(sanitized.panel_contents['panel-2'].state.grain).toBe('week');
    });

    it('accepts metric card widgets', () => {
        const built = createSurfaceConfigPayload({
            layout: {
                type: 'grid',
                panels: [
                    { id: 'tree-1', x: 0, y: 0, w: 48, h: 48 },
                    { id: 'panel-2', x: 48, y: 0, w: 18, h: 10 },
                ],
            },
            panelContents: {
                'tree-1': { kind: 'tree', treeView: { mode: 'tree' } },
                'panel-2': { kind: 'widget', widgetType: 'metricCard', state: { metricKey: 'totalSessionDuration' } },
            },
            detailPanel: 'auto',
            layoutBounds: { columns: 96, rows: 48 },
        });

        const sanitized = sanitizeSurfaceConfig(built);
        expect(sanitized).not.toBeNull();
        expect(sanitized.panel_contents['panel-2'].widgetType).toBe('metricCard');
        expect(sanitized.panel_contents['panel-2'].state.metricKey).toBe('totalSessionDuration');
    });

    it('separates overview widgets from the scoped surface when migrating legacy configs', () => {
        const built = createSurfaceConfigPayload({
            layout: {
                type: 'grid',
                panels: [
                    { id: 'tree-1', x: 0, y: 0, w: 48, h: 48 },
                    { id: 'panel-2', x: 48, y: 0, w: 18, h: 10 },
                ],
            },
            panelContents: {
                'tree-1': { kind: 'tree', treeView: { mode: 'tree' } },
                'panel-2': { kind: 'widget', widgetType: 'metricCard', state: { metricKey: 'recentSessionsCount' } },
            },
            detailPanel: 'auto',
            layoutBounds: { columns: 96, rows: 48 },
        });
        const legacy = {
            version: built.version,
            layout: built.layout,
            layout_bounds: built.layout_bounds,
            detail_panel: built.detail_panel,
            panel_contents: built.panel_contents,
        };

        const sanitized = sanitizeSurfaceConfig(legacy);

        expect(sanitized.view_configs.overview.panel_contents['panel-2'].widgetType).toBe('metricCard');
        expect(sanitized.view_configs.scoped.panel_contents['panel-2']).toBeUndefined();
        expect(sanitized.view_configs.scoped.layout.panels).toHaveLength(1);
    });

    it('updates one view mode without mutating the other', () => {
        const base = sanitizeSurfaceConfig(getDefaultSurfaceConfig());
        const scoped = getSurfaceModeConfig(base, 'scoped');
        const nextScoped = {
            ...scoped,
            layout: {
                type: 'grid',
                panels: [
                    { id: 'tree-1', x: 0, y: 0, w: 48, h: 48 },
                    { id: 'panel-3', x: 48, y: 0, w: 18, h: 10 },
                ],
            },
            panel_contents: {
                ...scoped.panel_contents,
                'panel-3': { kind: 'widget', widgetType: 'calendar', state: {} },
            },
        };

        const updated = updateSurfaceModeConfig(base, 'scoped', nextScoped);

        expect(updated.view_configs.scoped.panel_contents['panel-3'].widgetType).toBe('calendar');
        expect(updated.view_configs.overview.panel_contents['panel-3']).toBeUndefined();
    });

    it('rejects configs without exactly one tree panel', () => {
        const noTree = {
            version: 1,
            layout: { type: 'grid', panels: [{ id: 'w1', x: 0, y: 0, w: 24, h: 12 }] },
            panel_contents: { w1: { kind: 'widget', widgetType: 'calendar' } },
        };
        expect(sanitizeSurfaceConfig(noTree)).toBeNull();
    });

    it('rejects unknown widget types', () => {
        const bad = {
            version: 1,
            layout: {
                type: 'grid',
                panels: [
                    { id: 'tree-1', x: 0, y: 0, w: 48, h: 48 },
                    { id: 'w1', x: 48, y: 0, w: 24, h: 12 },
                ],
            },
            panel_contents: {
                'tree-1': { kind: 'tree' },
                w1: { kind: 'widget', widgetType: 'bogus' },
            },
        };
        expect(sanitizeSurfaceConfig(bad)).toBeNull();
    });
});

describe('fitConfigToBounds', () => {
    it('rescales panels proportionally when bounds change', () => {
        const config = getDefaultSurfaceConfig(); // 96x48 full-grid tree
        const fitted = fitConfigToBounds(config, { columns: 48, rows: 24 });
        const [panel] = fitted.layout.panels;
        expect(panel.w).toBe(48);
        expect(panel.h).toBe(24);
        expect(fitted.layout_bounds).toEqual({ columns: 48, rows: 24 });
    });

    it('is a no-op when bounds are unchanged', () => {
        const config = getDefaultSurfaceConfig();
        const fitted = fitConfigToBounds(config, { columns: 96, rows: 48 });
        expect(fitted).toBe(config);
    });
});

describe('seedMobileFromDesktop', () => {
    it('stacks panels into a single full-width column', () => {
        const desktop = createSurfaceConfigPayload({
            layout: {
                type: 'grid',
                panels: [
                    { id: 'tree-1', x: 0, y: 0, w: 60, h: 30 },
                    { id: 'panel-2', x: 60, y: 0, w: 36, h: 18 },
                ],
            },
            panelContents: {
                'tree-1': { kind: 'tree', treeView: { mode: 'tree' } },
                'panel-2': { kind: 'widget', widgetType: 'lastSession', state: {} },
            },
            detailPanel: 'auto',
            layoutBounds: { columns: 96, rows: 48 },
        });

        const mobile = seedMobileFromDesktop(desktop, { columns: 24 });
        expect(mobile.detail_panel).toBe('fullscreen');
        expect(mobile.layout.panels.every((p) => p.x === 0 && p.w === 24)).toBe(true);
        // Stacked, non-overlapping vertically.
        const [first, second] = mobile.layout.panels;
        expect(second.y).toBeGreaterThanOrEqual(first.y + first.h);
        // Tree forced to hierarchy on mobile.
        const treeId = getTreePanelId(mobile.panel_contents);
        expect(mobile.panel_contents[treeId].treeView.mode).toBe('hierarchy');
    });
});
