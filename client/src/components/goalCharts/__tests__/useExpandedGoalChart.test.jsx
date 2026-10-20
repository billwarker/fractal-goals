import { act, renderHook } from '@testing-library/react';

import useExpandedGoalChart, { CHART_FADE_MS } from '../useExpandedGoalChart';

describe('useExpandedGoalChart', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const setup = (props = {}) => {
        const fadeOutTree = vi.fn();
        const setSidebarMode = vi.fn();
        const hook = renderHook((overrides) => useExpandedGoalChart({
            isMobile: false, selectedNodeId: 'goal-1', isCreatingGoal: false, setSidebarMode, fadeOutTree, ...props, ...overrides,
        }));
        return { ...hook, fadeOutTree, setSidebarMode };
    };

    it('fades the tree out before the chart replaces it, and the chart out before the tree returns', () => {
        const { result, fadeOutTree } = setup();
        act(() => result.current.chartExpansion.expand({ goalId: 'goal-1', chartKey: 'condition_progress' }));
        expect(fadeOutTree).toHaveBeenCalled();
        expect(result.current.activeChart).toBeNull();
        act(() => vi.advanceTimersByTime(CHART_FADE_MS));
        expect(result.current.activeChart).toEqual({ goalId: 'goal-1', chartKey: 'condition_progress' });
        expect(result.current.chartExpansion.goalId).toBe('goal-1');

        act(() => result.current.chartExpansion.collapse());
        expect(result.current.isLeaving).toBe(true);
        expect(result.current.activeChart).not.toBeNull();
        act(() => vi.advanceTimersByTime(CHART_FADE_MS));
        expect(result.current.activeChart).toBeNull();
        expect(result.current.isLeaving).toBe(false);
    });

    it('returns to the tree when another goal is selected', () => {
        const { result, rerender } = setup();
        act(() => result.current.chartExpansion.expand({ goalId: 'goal-1', chartKey: 'k' }));
        act(() => vi.advanceTimersByTime(CHART_FADE_MS));
        rerender({ selectedNodeId: 'goal-2' });
        expect(result.current.activeChart).toBeNull();
    });

    it('steps the mobile goal details aside and brings them back', () => {
        const { result, setSidebarMode } = setup({ isMobile: true });
        act(() => result.current.chartExpansion.expand({ goalId: 'goal-1', chartKey: 'k' }));
        expect(setSidebarMode).toHaveBeenLastCalledWith(null);
        act(() => vi.advanceTimersByTime(CHART_FADE_MS));
        act(() => result.current.chartExpansion.collapse());
        act(() => vi.advanceTimersByTime(CHART_FADE_MS));
        expect(setSidebarMode).toHaveBeenLastCalledWith('goal-details');
    });
});
