import {
    buildVisualizationQueryExplanation,
    hasVisualizationQueryBuilder,
    VISUALIZATION_QUERY_BUILDER_KEYS,
} from '../visualizationQueryExplanations';
import { VISUALIZATION_REGISTRY } from '../visualizations/registry';

function baseContext(overrides = {}) {
    return {
        selectedCategory: 'activities',
        selectedVisualization: 'activityFrequency',
        visualization: { name: 'Activity Totals' },
        visualizationState: {},
        categoryLabel: 'Activities',
        dateRange: { start: null, end: null },
        globalFilters: {
            activityIds: new Set(),
            goalIds: new Set(),
            filters: { goals: { goalIds: [] }, activities: { activityIds: [] } },
        },
        resultShape: { sessions: 0, activities: 0, goals: 0 },
        ...overrides,
    };
}

describe('visualizationQueryExplanations', () => {
    it('has an explicit query explanation builder for every registered visualization', () => {
        const registryKeys = VISUALIZATION_REGISTRY.map((visualization) => (
            `${visualization.category}:${visualization.id}`
        )).sort();

        expect([...VISUALIZATION_QUERY_BUILDER_KEYS].sort()).toEqual(registryKeys);
        VISUALIZATION_REGISTRY.forEach((visualization) => {
            expect(hasVisualizationQueryBuilder(visualization.category, visualization.id)).toBe(true);
        });
    });

    it('does not emit generic raw-table SQL for any registered visualization', () => {
        VISUALIZATION_REGISTRY.forEach((visualization) => {
            const explanation = buildVisualizationQueryExplanation(baseContext({
                selectedCategory: visualization.category,
                selectedVisualization: visualization.id,
                visualization,
                effectiveSelectedActivity: {
                    id: 'activity-1',
                    name: 'Squat',
                    metric_definitions: [
                        { id: 'speed', name: 'Playback Speed', unit: '%' },
                        { id: 'rating', name: 'Rating', unit: 'score' },
                    ],
                },
                effectiveSelectedGoal: { id: 'goal-1', name: 'Practice Song' },
            }));

            expect(explanation.sql).not.toMatch(/^SELECT\s+\*\s+FROM/im);
            expect(explanation.metadata.aggregation).toEqual(expect.any(String));
            expect(explanation.metadata.chartFields.length).toBeGreaterThan(0);
        });
    });

    it('aligns metric trend SQL with selected activity metrics', () => {
        const explanation = buildVisualizationQueryExplanation(baseContext({
            selectedCategory: 'activities',
            selectedVisualization: 'metricTrends',
            visualization: { name: 'Metric Trends' },
            visualizationState: {
                metrics: ['speed', 'rating'],
                setsHandling: 'average',
                selectedSplit: 'all',
            },
            effectiveSelectedActivity: {
                id: 'activity-1',
                name: 'Playthrough',
                metric_definitions: [
                    { id: 'speed', name: 'Playback Speed', unit: '%' },
                    { id: 'rating', name: 'Rating', unit: 'score' },
                ],
            },
        }));

        expect(explanation.sql).toContain('FROM metric_values mv');
        expect(explanation.sql).toContain('JOIN activity_instances ai ON ai.id = mv.activity_instance_id');
        expect(explanation.sql).toContain("ai.activity_definition_id = 'activity-1'");
        expect(explanation.sql).toContain("mv.metric_definition_id IN ('speed', 'rating')");
        expect(explanation.sql).toContain('AVG(mv.value::numeric) AS metric_value');
    });

    it('keeps all visualization SQL explanations catalog-backed and runnable', () => {
        const explanation = buildVisualizationQueryExplanation(baseContext({
            selectedCategory: 'goals',
            selectedVisualization: 'goalMomentum',
            visualization: { name: 'Goal Momentum' },
            effectiveSelectedGoal: { id: 'goal-1', name: 'Practice Song' },
        }));

        expect(explanation.metadata.execution).not.toBe('read_model_sql');
        expect(explanation.metadata.runnable).not.toBe(false);
        expect(explanation.metadata.notes.join(' ')).not.toContain('read-model lineage');
    });
});
