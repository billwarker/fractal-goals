import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useProgramDetailController } from '../useProgramDetailController';

describe('useProgramDetailController', () => {
    it('keeps the sidebar closed by default until the user opens it', () => {
        const { result } = renderHook(() => useProgramDetailController({ goals: [] }));

        expect(result.current.isSidebarOpen).toBe(false);
    });

    it('opens block creation modal with an explicit selected range and resets state after save success', () => {
        const { result } = renderHook(() => useProgramDetailController({ goals: [] }));

        act(() => {
            result.current.setBlockCreationMode(true);
        });

        act(() => result.current.handleAddBlockClick({
            startDate: '2026-03-10', endDate: '2026-03-12',
        }));

        expect(result.current.showBlockModal).toBe(true);
        expect(result.current.blockModalData).toMatchObject({
            startDate: '2026-03-10',
            endDate: '2026-03-12',
        });

        act(() => {
            result.current.handleBlockSaveSuccess();
        });

        expect(result.current.showBlockModal).toBe(false);
        expect(result.current.blockModalData).toBe(null);
        expect(result.current.blockCreationMode).toBe(false);
    });

    it('opens goal modal for goal events and ignores other event types', () => {
        const goals = [{ id: 'goal-1', name: 'Goal 1' }];
        const { result } = renderHook(() => useProgramDetailController({ goals }));

        act(() => {
            result.current.handleEventClick({
                event: {
                    extendedProps: {
                        type: 'session',
                        id: 'goal-1',
                    },
                },
            });
        });

        expect(result.current.showGoalModal).toBe(false);

        act(() => {
            result.current.handleEventClick({
                event: {
                    extendedProps: {
                        type: 'goal',
                        id: 'goal-1',
                    },
                },
            });
        });

        expect(result.current.showGoalModal).toBe(true);
        expect(result.current.selectedGoal).toEqual(goals[0]);

        act(() => {
            result.current.closeGoalModal();
        });

        expect(result.current.showGoalModal).toBe(false);
        expect(result.current.modalMode).toBe('view');
    });

    it('opens a dated program day definition draft', () => {
        const { result } = renderHook(() => useProgramDetailController({ goals: [] }));

        act(() => {
            result.current.handleCreateDayForDate('block-1', '2026-03-09');
        });

        expect(result.current.showDayModal).toBe(true);
        expect(result.current.selectedBlockId).toBe('block-1');
        expect(result.current.dayModalInitialData).toMatchObject({
            date: '2026-03-09',
            day_of_week: [],
        });
    });
});
