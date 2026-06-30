import {
    createAnalyticsViewPayload,
    createDashboardLayoutPayload,
    getDefaultWindowState,
    getConfiguredWindowCount,
    getHighestWindowIndex,
    sanitizeDashboardLayoutPayload,
} from '../dashboardState';

describe('dashboardState helpers', () => {
    it('normalizes dashboard payloads to the active window ids', () => {
        const payload = createDashboardLayoutPayload({
            layout: {
                type: 'split',
                direction: 'vertical',
                position: 50,
                first: { type: 'window', id: 'window-1' },
                second: { type: 'window', id: 'window-3' },
            },
            windowStates: {
                'window-1': { ...getDefaultWindowState(), selectedCategory: 'sessions' },
                'window-2': { ...getDefaultWindowState(), selectedCategory: 'goals' },
                'window-3': { ...getDefaultWindowState(), selectedCategory: 'activities' },
            },
            selectedWindowId: 'window-2',
        });

        expect(payload.selected_window_id).toBe('window-1');
        expect(payload.version).toBe(3);
        expect(payload.global_filters.goals.goalIds).toEqual([]);
        expect(payload.layout_bounds).toEqual({ columns: 96, rows: 48 });
        expect(Object.keys(payload.window_states)).toEqual(['window-1', 'window-3']);
        expect(payload.window_states['window-3'].selectedCategory).toBe('activities');
        expect(payload.layout).toEqual({
            type: 'grid',
            panels: [
                { id: 'window-1', x: 0, y: 0, w: 48, h: 48 },
                { id: 'window-3', x: 48, y: 0, w: 48, h: 48 },
            ],
        });
    });

    it('rejects incompatible payloads and calculates the highest window index', () => {
        expect(sanitizeDashboardLayoutPayload({ version: 999 })).toBeNull();

        const sanitized = sanitizeDashboardLayoutPayload({
            version: 2,
            layout: {
                type: 'split',
                direction: 'horizontal',
                position: 40,
                first: { type: 'window', id: 'window-2' },
                second: { type: 'window', id: 'window-5' },
            },
            window_states: {
                'window-2': { selectedCategory: 'goals' },
                'window-5': { selectedCategory: 'sessions' },
            },
            selected_window_id: 'window-5',
        });

        expect(sanitized.windowStates['window-2'].selectedCategory).toBe('goals');
        expect(sanitized.selectedWindowId).toBe('window-5');
        expect(getHighestWindowIndex(sanitized.layout)).toBe(5);
    });

    it('persists global analytics filters and migrates older views to defaults', () => {
        const payload = createDashboardLayoutPayload({
            layout: { type: 'window', id: 'window-1' },
            windowStates: { 'window-1': {} },
            selectedWindowId: 'window-1',
            globalFilters: {
                goals: { goalIds: ['goal-1'], includeDescendants: false },
                activities: { activityIds: ['activity-1'], groupIds: ['group-1'] },
            },
            layoutBounds: { columns: 80, rows: 42 },
        });

        expect(payload.global_filters.goals.goalIds).toEqual(['goal-1']);
        expect(payload.global_filters.goals.includeDescendants).toBe(false);
        expect(payload.global_filters.activities.groupIds).toEqual(['group-1']);
        expect(payload.layout_bounds).toEqual({ columns: 80, rows: 42 });

        const migrated = sanitizeDashboardLayoutPayload({
            version: 1,
            layout: { type: 'window', id: 'window-1' },
            window_states: {
                'window-1': {
                    selectedCategory: 'activities',
                    selectedVisualization: 'activityFrequency',
                    activityTotalsMetric: 'duration',
                    activityTotalsLimit: 8,
                },
            },
            selected_window_id: 'window-1',
        });

        expect(migrated.globalFilters.goals.goalIds).toEqual([]);
        expect(migrated.globalFilters.activities.activityIds).toEqual([]);
        expect(migrated.windowStates['window-1'].visualizationState).toEqual({
            metric: 'duration',
            showGroups: false,
            limit: 8,
        });
        expect(migrated.windowStates['window-1'].visualizationStateByKey['activities:activityFrequency']).toEqual({
            metric: 'duration',
            showGroups: false,
            limit: 8,
        });
    });

    it('migrates nested split layouts into grid panels when saving and restoring analytics views', () => {
        const payload = createDashboardLayoutPayload({
            layout: {
                type: 'split',
                direction: 'vertical',
                position: 62.5,
                first: {
                    type: 'split',
                    direction: 'horizontal',
                    position: '33.3',
                    first: { type: 'window', id: 'window-1' },
                    second: { type: 'window', id: 'window-2' },
                },
                second: { type: 'window', id: 'window-3' },
            },
            windowStates: {
                'window-1': { selectedCategory: 'goals' },
                'window-2': { selectedCategory: 'sessions' },
                'window-3': { selectedCategory: 'activities' },
            },
            selectedWindowId: 'window-2',
        });

        expect(payload.layout.type).toBe('grid');
        expect(new Set(payload.layout.panels.map((panel) => panel.id))).toEqual(new Set(['window-1', 'window-2', 'window-3']));

        const sanitized = sanitizeDashboardLayoutPayload(payload);

        expect(sanitized.layout.type).toBe('grid');
        expect(sanitized.layout.panels).toEqual(payload.layout.panels);
        expect(sanitized.selectedWindowId).toBe('window-2');
    });

    it('clamps out-of-range grid panels to safe panel sizes', () => {
        const sanitized = sanitizeDashboardLayoutPayload({
            version: 3,
            layout: {
                type: 'grid',
                panels: [
                    { id: 'window-1', x: 99, y: -4, w: 99, h: 1 },
                    { id: 'window-2', x: 2, y: 4, w: 1, h: 2 },
                ],
            },
            window_states: {
                'window-1': {},
                'window-2': {},
            },
            selected_window_id: 'window-1',
        });

        expect(sanitized.layout.panels[0]).toEqual({ id: 'window-1', x: 0, y: 0, w: 96, h: 6 });
        expect(sanitized.layout.panels[1]).toEqual({ id: 'window-2', x: 2, y: 6, w: 12, h: 6 });
    });

    it('migrates retired session analytics panels to Session Trends', () => {
        const sanitized = sanitizeDashboardLayoutPayload({
            version: 2,
            layout: { type: 'window', id: 'window-1' },
            window_states: {
                'window-1': {
                    selectedCategory: 'sessions',
                    selectedVisualization: 'plannedVsActual',
                },
            },
            selected_window_id: 'window-1',
        });

        expect(sanitized.windowStates['window-1'].selectedVisualization).toBe('sessionTrends');
        expect(sanitized.windowStates['window-1'].visualizationState).toEqual({
            grain: 'week',
            metrics: ['sessions', 'duration'],
        });
    });

    it('saves a portable analytics view and restores it as a one-window layout', () => {
        const payload = createAnalyticsViewPayload({
            windowState: {
                selectedCategory: 'sessions',
                selectedVisualization: 'sessionTrends',
                visualizationState: { grain: 'month', metrics: ['duration'] },
            },
            globalFilters: {
                goals: { goalIds: ['goal-1'], includeDescendants: true },
            },
        });

        expect(payload.type).toBe('analytics_view');
        expect(payload.profile.selectedVisualization).toBe('sessionTrends');

        const restored = sanitizeDashboardLayoutPayload(payload);

        expect(restored.savedObjectKind).toBe('view');
        expect(restored.selectedWindowId).toBe('window-1');
        expect(restored.windowStates['window-1'].visualizationState).toEqual({
            grain: 'month',
            metrics: ['duration'],
        });
        expect(restored.globalFilters.goals.goalIds).toEqual(['goal-1']);
    });

    it('counts configured chart windows separately from empty split panels', () => {
        const layout = {
            type: 'grid',
            panels: [
                { id: 'window-1', x: 0, y: 0, w: 48, h: 48 },
                { id: 'window-2', x: 48, y: 0, w: 48, h: 48 },
            ],
        };

        expect(getConfiguredWindowCount(layout, {
            'window-1': { selectedCategory: 'goals', selectedVisualization: 'stats' },
            'window-2': { selectedCategory: 'sessions' },
        })).toBe(1);

        expect(getConfiguredWindowCount(layout, {
            'window-1': { selectedCategory: 'goals', selectedVisualization: 'stats' },
            'window-2': { selectedCategory: 'sessions', selectedVisualization: 'sessionTrends' },
        })).toBe(2);
    });
});
