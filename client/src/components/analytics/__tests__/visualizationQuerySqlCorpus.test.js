import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildVisualizationQueryExplanation } from '../visualizationQueryExplanations';
import { VISUALIZATION_REGISTRY } from '../visualizations/registry';

// The backend runs every query in this corpus through the analytics SQL guard and
// PostgreSQL (tests/integration/test_analytics_sql_guard.py), so explanation SQL a
// user opens in the console stays accepted by the raw-SQL security boundary.
// Regenerate with UPDATE_ANALYTICS_SQL_CORPUS=1 after an intentional builder change.
// Vitest runs from client/, whose parent is the repository root.
const CORPUS_PATH = resolve(process.cwd(), '../tests/fixtures/analytics_sql_corpus.json');

const SELECTED_ACTIVITY = {
    id: 'activity-1',
    name: 'Squat',
    metric_definitions: [
        { id: 'speed', name: 'Playback Speed', unit: '%' },
        { id: 'rating', name: 'Rating', unit: 'score' },
    ],
};

const VARIANTS = {
    selected: {
        dateRange: { start: null, end: null },
        globalFilters: { activityIds: new Set(), goalIds: new Set() },
        visualizationState: { metrics: ['speed', 'rating'] },
        effectiveSelectedActivity: SELECTED_ACTIVITY,
        effectiveSelectedGoal: { id: 'goal-1', name: "Practice O'Brien Song" },
    },
    filtered: {
        dateRange: { start: '2026-01-01', end: '2026-03-31' },
        globalFilters: { activityIds: new Set(['activity-1', 'activity-2']), goalIds: new Set(['goal-1']) },
        visualizationState: {},
    },
};

function buildCorpus() {
    return VISUALIZATION_REGISTRY.flatMap((visualization) => Object.entries(VARIANTS).map(([variant, context]) => ({
        id: `${visualization.category}:${visualization.id}:${variant}`,
        sql: buildVisualizationQueryExplanation({
            selectedCategory: visualization.category,
            selectedVisualization: visualization.id,
            visualization,
            categoryLabel: visualization.category,
            resultShape: {},
            ...context,
        }).sql,
    }))).sort((a, b) => a.id.localeCompare(b.id));
}

describe('visualization SQL corpus', () => {
    it('matches the shared fixture the backend SQL guard executes', () => {
        const corpus = buildCorpus();
        const serialized = `${JSON.stringify(corpus, null, 2)}\n`;
        if (process.env.UPDATE_ANALYTICS_SQL_CORPUS === '1') {
            writeFileSync(CORPUS_PATH, serialized);
        }
        expect(existsSync(CORPUS_PATH)).toBe(true);
        expect(readFileSync(CORPUS_PATH, 'utf8')).toBe(serialized);
    });
});
