import { act, renderHook } from '@testing-library/react';

import useGoalDueDateDrop from '../useGoalDueDateDrop';

const { showActionToast } = vi.hoisted(() => ({ showActionToast: vi.fn() }));
vi.mock('../../components/atoms/ActionToast', () => ({ showActionToast }));

const program = { start_date: '2026-10-01', end_date: '2026-10-31' };
const goals = [
    { id: 'g1', name: 'Run a 10k', deadline: '2026-10-20T00:00:00Z' },
    { id: 'g2', name: 'No date yet', attributes: { deadline: null } },
];

function setPointer(fine) {
    window.matchMedia = vi.fn(() => ({ matches: fine, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

describe('useGoalDueDateDrop', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setPointer(true);
    });

    const render = (overrides = {}) => {
        const updateGoal = vi.fn(async () => ({ deadline_warnings: [{ code: 'after_parent', parent_deadline: '2026-10-25' }] }));
        const hook = renderHook(() => useGoalDueDateDrop({ goals, program, today: '2026-10-19', updateGoal, ...overrides }));
        return { ...hook, updateGoal };
    };

    it('saves the dropped date and offers Undo, listing server and program warnings', async () => {
        const { result, updateGoal } = render();
        expect(result.current.dueDragEnabled).toBe(true);

        await act(async () => { await result.current.onGoalDueDrop('g1', '2026-11-02'); });

        expect(updateGoal).toHaveBeenCalledWith('g1', { deadline: '2026-11-02' });
        const toast = showActionToast.mock.lastCall[0];
        expect(toast).toMatchObject({ message: 'Run a 10k: due Nov 2', tone: 'warning', actionLabel: 'Undo' });
        expect(toast.details).toEqual([
            'Outside the program (Oct 1 – Oct 31)',
            'After the parent goal’s due date (Oct 25)',
        ]);

        await act(async () => { await toast.onAction(); });
        expect(updateGoal).toHaveBeenLastCalledWith('g1', { deadline: '2026-10-20' });
    });

    it('restores "no due date" on Undo for a goal that had none', async () => {
        const updateGoal = vi.fn(async () => ({ deadline_warnings: [] }));
        const { result } = render({ updateGoal });
        await act(async () => { await result.current.onGoalDueDrop('g2', '2026-10-21'); });
        const toast = showActionToast.mock.lastCall[0];
        expect(toast).toMatchObject({ tone: 'info', details: [] });
        await act(async () => { await toast.onAction(); });
        expect(updateGoal).toHaveBeenLastCalledWith('g2', { deadline: null });
    });

    it('ignores drops on the same date, unknown goals, and failed saves', async () => {
        const failing = vi.fn(async () => { throw new Error('nope'); });
        const { result } = render({ updateGoal: failing });
        await act(async () => {
            await result.current.onGoalDueDrop('g1', '2026-10-20');
            await result.current.onGoalDueDrop('missing', '2026-10-21');
        });
        expect(failing).not.toHaveBeenCalled();
        await act(async () => { await result.current.onGoalDueDrop('g1', '2026-10-22'); });
        expect(failing).toHaveBeenCalledTimes(1);
        expect(showActionToast).not.toHaveBeenCalled();
    });

    it('is off on mobile, on touch-only screens, and without a program', () => {
        expect(render({ isMobile: true }).result.current).toEqual({ dueDragEnabled: false, onGoalDueDrop: null });
        expect(render({ program: null }).result.current.dueDragEnabled).toBe(false);
        setPointer(false);
        expect(render().result.current.dueDragEnabled).toBe(false);
    });
});
