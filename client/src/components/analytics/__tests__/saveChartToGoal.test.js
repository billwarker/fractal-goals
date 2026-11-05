import { beforeEach, describe, expect, it, vi } from 'vitest';

import saveChartToGoal from '../annotate/saveChartToGoal';

const { createAnalyticsView, attachGoalChart } = vi.hoisted(() => ({ createAnalyticsView: vi.fn(), attachGoalChart: vi.fn() }));
vi.mock('../../../utils/api', () => ({ fractalApi: { createAnalyticsView, attachGoalChart } }));

const base = { rootId: 'r', goalId: 'g', goalName: 'Bench 225', windowState: { selectedCategory: 'activities', selectedVisualization: 'scatterPlot' }, globalFilters: null };

describe('saveChartToGoal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createAnalyticsView.mockResolvedValue({ data: { data: { id: 'new-view' } } });
        attachGoalChart.mockResolvedValue({});
    });

    it('attaches an unedited saved view without copying it', async () => {
        await saveChartToGoal({ ...base, reusableViewId: 'open-view' });
        expect(createAnalyticsView).not.toHaveBeenCalled();
        expect(attachGoalChart).toHaveBeenCalledWith('r', 'g', 'open-view');
    });

    it('otherwise saves the chart under the goal name, then attaches it', async () => {
        await saveChartToGoal({ ...base, reusableViewId: null });
        expect(createAnalyticsView).toHaveBeenCalledWith('r', expect.objectContaining({
            name: 'Bench 225',
            kind: 'view',
            suffix_name_on_conflict: true,
            layout: expect.objectContaining({ type: 'analytics_view' }),
        }));
        expect(attachGoalChart).toHaveBeenCalledWith('r', 'g', 'new-view');
    });

    it('fails without attaching when the view can’t be saved', async () => {
        createAnalyticsView.mockRejectedValue(new Error('nope'));
        await expect(saveChartToGoal({ ...base, reusableViewId: null })).rejects.toThrow('nope');
        expect(attachGoalChart).not.toHaveBeenCalled();
    });
});
