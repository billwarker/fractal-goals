import { viewAttachProblem } from '../useGoalCharts';

const view = (profile, kind = 'view') => ({ kind, layout: { type: 'analytics_view', version: 1, profile, global_filters: {} } });

describe('viewAttachProblem', () => {
    it('lets activity, goal and session views attach', () => {
        expect(viewAttachProblem(view({ selectedCategory: 'activities', selectedVisualization: 'metricTrends' }))).toBeNull();
        expect(viewAttachProblem(view({ selectedCategory: 'goals', selectedVisualization: 'goalCompletionTimeline' }))).toBeNull();
        expect(viewAttachProblem(view({ selectedCategory: 'sessions', selectedVisualization: 'sessionTrends' }))).toBeNull();
    });

    it('explains why other saved objects cannot', () => {
        expect(viewAttachProblem(view({ selectedCategory: 'query', selectedVisualization: 'sql' }))).toBe('Query views stay in Analytics');
        expect(viewAttachProblem(view({ selectedCategory: 'sessions' }))).toBe('This view has no chart yet');
        expect(viewAttachProblem({ kind: 'dashboard', layout: {} })).toBe('Only single-chart views can be added to goals');
        expect(viewAttachProblem(null)).toBe('View not found');
    });
});
