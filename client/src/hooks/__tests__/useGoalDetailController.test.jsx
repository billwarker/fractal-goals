import { act, renderHook } from '@testing-library/react';

import useGoalDetailController from '../useGoalDetailController';

describe('useGoalDetailController', () => {
    it('opens create mode already editing and cancels by closing the modal', () => {
        const onClose = vi.fn();

        const { result } = renderHook(() => useGoalDetailController({
            goal: null,
            goalId: null,
            mode: 'create',
            isOpen: true,
            onClose,
            onToggleCompletion: vi.fn(),
            resetForm: vi.fn(),
        }));

        expect(result.current.isEditing).toBe(true);

        act(() => {
            result.current.handleCancel();
        });

        expect(onClose).toHaveBeenCalled();
    });

    it('tracks optimistic completion state and notifies the toggle handler', () => {
        const onToggleCompletion = vi.fn();

        const { result } = renderHook(() => useGoalDetailController({
            goal: {
                id: 'goal-1',
                completed: false,
                attributes: { id: 'goal-1', completed: false, completed_at: null },
            },
            goalId: 'goal-1',
            mode: 'view',
            isOpen: true,
            onClose: vi.fn(),
            onToggleCompletion,
            resetForm: vi.fn(),
        }));

        act(() => {
            result.current.handleCompletionConfirm(new Date('2026-03-01T12:00:00Z'));
        });

        expect(result.current.isCompleted).toBe(true);
        expect(result.current.localCompletedAt).toBe('2026-03-01T12:00:00.000Z');
        expect(onToggleCompletion).toHaveBeenCalledWith('goal-1', false);
    });

    it('resets state when the controlled goal changes', () => {
        const { result, rerender } = renderHook(
            ({ goal, goalId }) => useGoalDetailController({
                goal,
                goalId,
                mode: 'view',
                onClose: vi.fn(),
                onToggleCompletion: vi.fn(),
                resetForm: vi.fn(),
            }),
            {
                initialProps: {
                    goal: {
                        id: 'goal-1',
                        completed: false,
                        attributes: { id: 'goal-1', completed: false, completed_at: null },
                    },
                    goalId: 'goal-1',
                },
            }
        );

        act(() => {
            result.current.setIsEditing(true);
            result.current.setViewState('target-manager');
        });

        rerender({
            goal: {
                id: 'goal-2',
                completed: true,
                attributes: { id: 'goal-2', completed: true, completed_at: '2026-03-02T10:00:00.000Z' },
            },
            goalId: 'goal-2',
        });

        expect(result.current.isEditing).toBe(false);
        expect(result.current.viewState).toBe('goal');
        expect(result.current.isCompleted).toBe(true);
        expect(result.current.localCompletedAt).toBe('2026-03-02T10:00:00.000Z');
    });
});
