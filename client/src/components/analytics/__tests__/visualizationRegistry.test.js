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
    normalizeSelectedVisualization,
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
        expect(getVisualizationDefaultState('activities', 'activityTrends')).toEqual({
            metrics: ['instances', 'duration'],
        });
        expect(getVisualizationDefaultState('activities', 'metricTrends')).toEqual({
            setsHandling: 'top',
            selectedSplit: 'all',
            metrics: [],
        });
        expect(getVisualizationDefaultState('activities', 'metricProgress')).toEqual({
            metric: null,
        });
        expect(getVisualizationDefaultState('sessions', 'sessionTrends')).toEqual({
            grain: 'week',
            metrics: ['sessions', 'duration'],
        });
        expect(getVisualizationDefaultState('sessions', 'startDistribution')).toEqual({
            markers: ['start'],
        });
        expect(getVisualizationDefaultState('sessions', 'durationHistogram')).toEqual({
            bucketCount: 5,
        });
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
        const selectedActivityTrends = {
            ...updatedTotals,
            ...getVisualizationSelectionUpdate(updatedTotals, 'activityTrends'),
        };

        expect(selectedActivityTrends.visualizationState).toEqual({
            metrics: ['instances', 'duration'],
        });
        expect(selectedActivityTrends.visualizationStateByKey['activities:activityFrequency']).toEqual({
            metric: 'duration',
            showGroups: false,
            limit: 8,
        });

        const restoredTotals = {
            ...selectedActivityTrends,
            ...getVisualizationSelectionUpdate(selectedActivityTrends, 'activityFrequency'),
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
            selectedVisualization: 'activityTrends',
            visualizationState: { metric: 'duration', limit: 8 },
            visualizationStateByKey: {
                'activities:activityTrends': {
                    metrics: ['duration'],
                },
            },
        })).toEqual({
            metrics: ['duration'],
        });
    });

    it('aliases retired session trend visualizations to Session Trends', () => {
        expect(normalizeSelectedVisualization('sessions', 'durationTrend')).toBe('sessionTrends');
        expect(normalizeSelectedVisualization('sessions', 'weeklyChart')).toBe('sessionTrends');
        expect(normalizeSelectedVisualization('sessions', 'consistency')).toBe('sessionTrends');
        expect(normalizeSelectedVisualization('sessions', 'heatmap')).toBe('sessionTrends');
        expect(normalizeSelectedVisualization('sessions', 'completionRate')).toBe('sessionTrends');
        expect(normalizeSelectedVisualization('sessions', 'plannedVsActual')).toBe('sessionTrends');
        expect(normalizeVisualizationState({
            selectedCategory: 'sessions',
            selectedVisualization: 'weeklyChart',
        })).toEqual({
            grain: 'week',
            metrics: ['sessions', 'duration'],
        });
    });

    it('removes retired session graph cards from the sessions registry', () => {
        const sessionIds = getVisualizationsByCategory('sessions').map((visualization) => visualization.id);

        expect(sessionIds).not.toContain('heatmap');
        expect(sessionIds).not.toContain('completionRate');
        expect(sessionIds).not.toContain('plannedVsActual');
        expect(getVisualization('sessions', 'startDistribution')?.name).toBe('Start and End Times');
    });

    it('aliases retired activity visualizations to their consolidated replacements', () => {
        expect(normalizeSelectedVisualization('activities', 'lineGraph')).toBe('metricTrends');
        expect(normalizeSelectedVisualization('activities', 'timeByActivity')).toBe('activityFrequency');
        expect(normalizeSelectedVisualization('activities', 'personalBest')).toBe('metricTrends');
        expect(normalizeSelectedVisualization('activities', 'metricVolume')).toBe('metricTrends');
        expect(normalizeVisualizationState({
            selectedCategory: 'activities',
            selectedVisualization: 'lineGraph',
            selectedMetric: { id: 'm1', name: 'Weight' },
            selectedMetricY2: { id: 'm2', name: 'Reps' },
        })).toEqual({
            setsHandling: 'top',
            selectedSplit: 'all',
            metrics: ['m1', 'm2'],
        });
    });

    it('removes retired activity graph cards from the activities registry', () => {
        const activityIds = getVisualizationsByCategory('activities').map((visualization) => visualization.id);

        expect(activityIds).toContain('activityTrends');
        expect(getVisualization('activities', 'activityTrends')?.name).toBe('Activity Trends');
        expect(activityIds).toContain('metricTrends');
        expect(activityIds).toContain('metricProgress');
        expect(getVisualization('activities', 'scatterPlot')?.name).toBe('Metric Scatter Plot');
        expect(activityIds).not.toContain('lineGraph');
        expect(activityIds).not.toContain('timeByActivity');
        expect(activityIds).not.toContain('personalBest');
        expect(activityIds).not.toContain('metricVolume');
    });
});
