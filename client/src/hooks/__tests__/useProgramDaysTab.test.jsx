import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../useGoalQueries', async (importOriginal) => ({
    ...(await importOriginal()),
    useGoalActivities: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
const loggedSessionView = { goal_tree: { id: 'root', name: 'Root', children: [] }, session_activity_ids: ['fl'] };
vi.mock('../useSessionQueries', async (importOriginal) => ({
    ...(await importOriginal()),
    useSessionGoalsView: (rootId, sessionId) => ({ data: sessionId === 'logged-1' ? loggedSessionView : null }),
}));
vi.mock('../useProgramSessionPlans', () => ({
    useProgramPlanOccurrences: () => ({ data: new Map(), isLoading: false, error: null }),
}));

import useProgramDaysTab from '../useProgramDaysTab';

const program = {
    id: 'program-1',
    days: [
        { id: 'a', name: 'A', day_number: 1, templates: [] },
        { id: 'b', name: 'B', day_number: 2, templates: [] },
        { id: 'c', name: 'C', day_number: 3, templates: [] },
    ],
};

function renderTab(onReorderDays) {
    return renderHook(() => useProgramDaysTab({
        rootId: 'root', program, today: '2026-10-05', timezone: 'UTC', enabled: true,
        setViewMode: vi.fn(), onLeavePane: vi.fn(), onCreateDay: vi.fn(), onEditDay: vi.fn(), onReorderDays,
    }));
}

const names = (result) => result.current.days.map((day) => day.name);

describe('useProgramDaysTab day order', () => {
    it('shows a move at once and saves the full order', async () => {
        let finish;
        const onReorderDays = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
        const { result } = renderTab(onReorderDays);

        let pending;
        act(() => { pending = result.current.navigator.props.onMoveDay('c', -1); });

        expect(names(result)).toEqual(['A', 'C', 'B']);
        expect(onReorderDays).toHaveBeenCalledWith(['a', 'c', 'b']);
        await act(async () => { finish(); await pending; });
    });

    it('returns to the saved order when the save fails', async () => {
        const onReorderDays = vi.fn().mockRejectedValue(new Error('offline'));
        const { result } = renderTab(onReorderDays);

        await act(async () => { await result.current.navigator.props.onMoveDay('a', 1); });

        expect(names(result)).toEqual(['A', 'B', 'C']);
    });

    it('ignores moves past either end', async () => {
        const onReorderDays = vi.fn();
        const { result } = renderTab(onReorderDays);

        await act(async () => { await result.current.navigator.props.onMoveDay('a', -1); });

        expect(onReorderDays).not.toHaveBeenCalled();
    });
});

describe('useProgramDaysTab goal scope', () => {
    const goalTree = { id: 'root', name: 'Root', children: [
        { id: 'strength', name: 'Strength', children: [{ id: 'lever', name: 'Front lever', children: [] }] },
        { id: 'push', name: 'Push', children: [] },
    ] };
    const activities = [
        { id: 'fl', name: 'Tuck FL', associated_goal_ids: ['lever'] },
        { id: 'pike', name: 'Pike Push Ups', associated_goal_ids: ['push'] },
    ];
    const plan = (activityIds, overrides = {}) => ({
        date: '2026-10-12', templateId: 't1', templateName: 'Upper', readOnly: false,
        activityIds, selectedActivityId: null, ...overrides,
    });
    const goal = (id) => ({ id, name: id });

    function renderScoped(initialEnabled = true, extra = {}) {
        return renderHook(({ enabled, tree = goalTree }) => useProgramDaysTab({
            rootId: 'root', program: { ...program, goal_ids: ['strength'] }, today: '2026-10-05', timezone: 'UTC',
            enabled, setViewMode: vi.fn(), onLeavePane: vi.fn(), onCreateDay: vi.fn(), onEditDay: vi.fn(),
            goalTree: tree, activities, activityGroups: [], ...extra,
        }), { initialProps: { enabled: initialEnabled } });
    }
    const panel = (result) => result.current.goalsPanel.props;

    it('creates goals under the scoped goal, toward the selected plan activity when there is one', () => {
        const onStartSubGoalCreation = vi.fn();
        const { result } = renderScoped(true, { onStartSubGoalCreation });
        act(() => { result.current.planFocus.onReport(plan(['fl'])); });

        act(() => { panel(result).onStartSubGoalCreation(goal('strength')); });
        expect(onStartSubGoalCreation).toHaveBeenLastCalledWith(goal('strength'), expect.objectContaining({
            initialActivities: [], initialCompletion: null,
        }));

        act(() => { result.current.planFocus.onReport(plan(['fl'], { selectedActivityId: 'fl' })); });
        act(() => { panel(result).onStartSubGoalCreation(goal('strength')); });
        const [, context] = onStartSubGoalCreation.mock.lastCall;
        expect(context.initialActivities).toEqual([activities[0]]);
        // Tuck FL tracks no metrics, so it starts without a threshold.
        expect(context.initialCompletion).toBeNull();
    });

    it('keeps a goal created from the pane in view though no plan activity works toward it', () => {
        const onStartSubGoalCreation = vi.fn();
        const { result, rerender } = renderScoped(true, { onStartSubGoalCreation });
        act(() => { result.current.planFocus.onReport(plan(['fl'])); });
        act(() => { panel(result).onStartSubGoalCreation(goal('push')); });

        const grown = { ...goalTree, children: [goalTree.children[0], {
            ...goalTree.children[1], children: [{ id: 'new', name: 'New', parent_id: 'push', children: [] }],
        }] };
        const [, context] = onStartSubGoalCreation.mock.lastCall;
        act(() => { context.onCreated({ id: 'new' }); });
        rerender({ enabled: true, tree: grown });

        expect(panel(result).planGoalsView.session_goal_ids).toContain('new');
    });

    it('offers no creation without a handler', () => {
        const { result } = renderScoped();
        act(() => { result.current.planFocus.onReport(plan(['fl'])); });
        expect(panel(result).onStartSubGoalCreation).toBeNull();
    });

    it("follows the reported plan and scopes the picker to a goal in its hierarchy", () => {
        const { result } = renderScoped();
        act(() => { result.current.planFocus.onReport(plan(['fl'])); });

        expect(panel(result).activePlan.templateName).toBe('Upper');
        act(() => { panel(result).onGoalScopeToggle(goal('lever')); });

        expect(result.current.planFocus.activityGoalScope.goal.id).toBe('lever');
        act(() => { panel(result).onGoalScopeToggle(goal('lever')); });
        expect(result.current.planFocus.activityGoalScope).toBeNull();
    });

    it("keeps the scope on another card that works toward the goal, and clears it on one that doesn't", () => {
        const { result } = renderScoped();
        act(() => { result.current.planFocus.onReport(plan(['fl'])); });
        act(() => { panel(result).onGoalScopeToggle(goal('lever')); });

        act(() => { result.current.planFocus.onReport(plan(['fl', 'pike'], { date: '2026-10-05', readOnly: true })); });
        expect(result.current.planFocus.activityGoalScope?.goal.id).toBe('lever');

        act(() => { result.current.planFocus.onReport(plan(['pike'], { date: '2026-10-05' })); });
        expect(result.current.planFocus.activityGoalScope).toBeNull();
        expect(result.current.planFocus.announcement).toMatch(/scope for lever cleared/i);
    });

    it('clears the scope and the active plan when the day changes or the tab is left', () => {
        const { result, rerender } = renderScoped();
        act(() => { result.current.planFocus.onReport(plan(['fl'])); });
        act(() => { panel(result).onGoalScopeToggle(goal('strength')); });

        act(() => { result.current.navigator.props.onSelectDay('b'); });
        expect(result.current.planFocus.activityGoalScope).toBeNull();
        expect(panel(result).activePlan).toBeNull();

        act(() => { result.current.planFocus.onReport(plan(['fl'])); });
        act(() => { panel(result).onGoalScopeToggle(goal('strength')); });
        rerender({ enabled: false });
        expect(result.current.planFocus.activityGoalScope).toBeNull();
    });

    it("shows a logged session's own goals view, as its session page does", () => {
        const { result } = renderScoped();
        act(() => { result.current.planFocus.onReport(plan(['fl'])); });
        expect(panel(result).planGoalsView).not.toBe(loggedSessionView);

        act(() => {
            result.current.planFocus.onReport(plan(['fl'], {
                readOnly: true, sessionId: 'logged-1',
                instances: [{ id: 'i1', activity_definition_id: 'fl', completed: true, associated_goal_ids: [] }],
            }));
        });
        expect(panel(result).planGoalsView).toBe(loggedSessionView);
        expect(panel(result).activePlan.instances).toHaveLength(1);
    });
});

