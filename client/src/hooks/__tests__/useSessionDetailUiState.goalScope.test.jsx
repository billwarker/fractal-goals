import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSessionDetailUiState } from '../useSessionDetailUiState';

const options = { rootId: 'root', sessionId: 'session', isMobile: false, addActivity: vi.fn(), setSidePaneMode: vi.fn() };
const first = { id: 'goal-a', name: 'First goal' };
const second = { id: 'goal-b', name: 'Second goal' };

describe('scoped activity builder defaults', () => {
    it.each([null, { _builderKey: 'copy', associated_goal_ids: ['existing'] }])('captures the opening scope for a create/copy draft', (draft) => {
        const { result } = renderHook(() => useSessionDetailUiState(options));
        act(() => result.current.handleToggleGoalScope(first));
        act(() => result.current.handleOpenActivityBuilder(0, draft));
        expect(result.current.builderInitialGoalIds).toEqual(['goal-a']);
        act(() => result.current.handleToggleGoalScope(second));
        expect(result.current.builderInitialGoalIds).toEqual(['goal-a']);
        expect(result.current.builderActivity).toEqual(draft);
        act(() => result.current.handleCloseActivityBuilder());
        act(() => result.current.handleOpenActivityBuilder(0));
        expect(result.current.builderInitialGoalIds).toEqual(['goal-b']);
    });
    it('does not add a scope when editing an existing definition or creating unscoped', () => {
        const { result } = renderHook(() => useSessionDetailUiState(options));
        act(() => result.current.handleOpenActivityBuilder(0));
        expect(result.current.builderInitialGoalIds).toEqual([]);
        act(() => result.current.handleToggleGoalScope(first));
        act(() => result.current.handleOpenActivityBuilder(0, { id: 'definition' }, { mode: 'edit' }));
        expect(result.current.builderInitialGoalIds).toEqual([]);
    });
    it('does not carry scope across sessions', () => {
        const { result, rerender } = renderHook((props) => useSessionDetailUiState(props), { initialProps: options });
        act(() => result.current.handleToggleGoalScope(first));
        rerender({ ...options, sessionId: 'another-session' });
        expect(result.current.scopedGoal).toBeNull();
        act(() => result.current.handleOpenActivityBuilder(0));
        expect(result.current.builderInitialGoalIds).toEqual([]);
    });
});

describe('scoped activity builder groups', () => {
    const withGroup = { id: 'goal-g', name: 'Head Over Heels', attributes: { associated_activity_group_ids: ['group-1'] } };

    it("offers the scoped goal's groups for create and copy drafts", () => {
        const { result } = renderHook(() => useSessionDetailUiState(options));
        act(() => result.current.handleToggleGoalScope(withGroup));
        act(() => result.current.handleOpenActivityBuilder(0));
        expect(result.current.builderScopeGroups).toEqual({ ids: ['group-1'], goalName: 'Head Over Heels' });
        act(() => result.current.handleOpenActivityBuilder(0, { _builderKey: 'copy', group_id: 'other' }));
        expect(result.current.builderScopeGroups).toEqual({ ids: ['group-1'], goalName: 'Head Over Heels' });
    });

    it('passes every group of a goal that has several', () => {
        const { result } = renderHook(() => useSessionDetailUiState(options));
        act(() => result.current.handleToggleGoalScope({
            id: 'goal-m', name: 'Songs', attributes: { associated_activity_group_ids: ['group-1', 'group-2'] },
        }));
        act(() => result.current.handleOpenActivityBuilder(0));
        expect(result.current.builderScopeGroups).toEqual({ ids: ['group-1', 'group-2'], goalName: 'Songs' });
    });

    it('has no groups when editing, unscoped, or the scoped goal has none', () => {
        const { result } = renderHook(() => useSessionDetailUiState(options));
        act(() => result.current.handleOpenActivityBuilder(0));
        expect(result.current.builderScopeGroups).toBeNull();
        act(() => result.current.handleToggleGoalScope(withGroup));
        act(() => result.current.handleOpenActivityBuilder(0, { id: 'definition' }, { mode: 'edit' }));
        expect(result.current.builderScopeGroups).toBeNull();
        act(() => result.current.handleToggleGoalScope(first));
        act(() => result.current.handleOpenActivityBuilder(0));
        expect(result.current.builderScopeGroups).toBeNull();
    });
});
