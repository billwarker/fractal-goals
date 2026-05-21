import {
    getVisualization,
    getVisualizationsByCategory,
    VISUALIZATION_CATEGORIES,
    VISUALIZATION_REGISTRY,
} from '../visualizations/registry';
import { normalizeVisualizationState } from '../visualizations/state';

describe('analytics visualization registry', () => {
    it('registers every visualization with a chart and controls contract', () => {
        expect(VISUALIZATION_REGISTRY.length).toBeGreaterThan(0);

        VISUALIZATION_REGISTRY.forEach((visualization) => {
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
});
