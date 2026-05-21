import {
    getVisualizationDefaultState,
    getVisualization,
    getVisualizationsByCategory,
    VISUALIZATION_CATEGORIES,
    VISUALIZATION_REGISTRY,
} from '../visualizations/registry';
import {
    getVisualizationSelectionUpdate,
    getVisualizationStateUpdate,
    normalizeVisualizationState,
} from '../visualizations/state';

describe('analytics visualization registry', () => {
    it('registers every visualization with a chart and controls contract', () => {
        expect(VISUALIZATION_REGISTRY.length).toBeGreaterThan(0);
        const keys = new Set();

        VISUALIZATION_REGISTRY.forEach((visualization) => {
            const key = `${visualization.category}:${visualization.id}`;
            expect(keys.has(key)).toBe(false);
            keys.add(key);
            expect(visualization.id).toBeTruthy();
            expect(visualization.category).toBeTruthy();
            expect(visualization.name).toBeTruthy();
            expect(visualization.iconType).toBeTruthy();
            expect(visualization.defaultState).toBeDefined();
            expect(visualization.Chart).toBeTypeOf('function');
            expect(visualization.Controls).toBeTypeOf('function');
        });
    });

    it('groups visualizations by category for panel selection', () => {
        VISUALIZATION_CATEGORIES.forEach((category) => {
            expect(getVisualizationsByCategory(category.id).length).toBeGreaterThan(0);
        });

        expect(getVisualization('activities', 'activityFrequency')?.name).toBe('Activity Totals');
        expect(getVisualization('goals', 'goalDetail')?.selectionRequirements.goal).toBe(true);
    });

    it('keeps registry defaults as the source of truth for state defaults', () => {
        expect(getVisualizationDefaultState('activities', 'activityFrequency')).toEqual({
            metric: 'instances',
            showGroups: false,
            limit: 15,
        });
        expect(getVisualizationDefaultState('sessions', 'heatmap')).toEqual({ months: 12 });
    });

    it('migrates legacy flat fields into visualizationState', () => {
        expect(normalizeVisualizationState({
            selectedCategory: 'activities',
            selectedVisualization: 'activityFrequency',
            activityTotalsMetric: 'duration',
            activityTotalsShowGroups: true,
            activityTotalsLimit: 7,
        })).toEqual({
            metric: 'duration',
            showGroups: true,
            limit: 7,
        });

        expect(normalizeVisualizationState({
            selectedCategory: 'goals',
            selectedVisualization: 'timeDistribution',
            goalTimeDurationMode: 'session',
            goalTimeInheritanceMode: 'descendants',
        })).toEqual({
            durationMode: 'session',
            inheritanceMode: 'descendants',
        });
    });

    it('scopes visualization state by visualization key', () => {
        const activityTotalsState = {
            selectedCategory: 'activities',
            selectedVisualization: 'activityFrequency',
            visualizationState: { metric: 'instances', showGroups: false, limit: 15 },
            visualizationStateByKey: {},
        };

        const updatedTotals = {
            ...activityTotalsState,
            ...getVisualizationStateUpdate(activityTotalsState, { metric: 'duration', limit: 8 }),
        };
        const selectedLineGraph = {
            ...updatedTotals,
            ...getVisualizationSelectionUpdate(updatedTotals, 'lineGraph'),
        };

        expect(selectedLineGraph.visualizationState).toEqual({
            setsHandling: 'top',
            selectedSplit: 'all',
            metric: null,
            metricY2: null,
        });
        expect(selectedLineGraph.visualizationStateByKey['activities:activityFrequency']).toEqual({
            metric: 'duration',
            showGroups: false,
            limit: 8,
        });

        const restoredTotals = {
            ...selectedLineGraph,
            ...getVisualizationSelectionUpdate(selectedLineGraph, 'activityFrequency'),
        };
        expect(restoredTotals.visualizationState).toEqual({
            metric: 'duration',
            showGroups: false,
            limit: 8,
        });
    });

    it('prefers keyed state over stale unkeyed state', () => {
        expect(normalizeVisualizationState({
            selectedCategory: 'activities',
            selectedVisualization: 'lineGraph',
            visualizationState: { metric: 'duration', limit: 8 },
            visualizationStateByKey: {
                'activities:lineGraph': {
                    setsHandling: 'average',
                    selectedSplit: 'left',
                    metric: null,
                    metricY2: null,
                },
            },
        })).toEqual({
            setsHandling: 'average',
            selectedSplit: 'left',
            metric: null,
            metricY2: null,
        });
    });
});
