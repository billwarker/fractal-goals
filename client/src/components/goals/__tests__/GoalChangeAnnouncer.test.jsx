import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import GoalChangeAnnouncer from '../GoalChangeAnnouncer';
import { publishGoalChanges } from '../../../utils/goalChanges';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), dismiss: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));
vi.mock('../../goalDetail/NoteGoalModal', () => ({
    default: ({ goalId, initialView }) => <div role="dialog">{`${initialView}:${goalId}`}</div>,
}));

function renderAnnouncer() {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(<QueryClientProvider client={queryClient}><GoalChangeAnnouncer /></QueryClientProvider>);
    return { invalidate };
}

const goal = { id: 'g1', name: 'Full Front Lever', type: 'ShortTermGoal' };

beforeEach(() => vi.clearAllMocks());

describe('GoalChangeAnnouncer', () => {
    it('announces a completed goal and offers to write its note', () => {
        const { invalidate } = renderAnnouncer();
        act(() => publishGoalChanges('root-1', { completed: [goal], uncompleted: [] }));

        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['fractalTree', 'root-1'] });
        const [renderToast, options] = toastMock.success.mock.calls[0];
        // One toast id per goal and state, so the same announcement twice shows once.
        expect(options).toEqual(expect.objectContaining({ id: 'goal-completed-g1' }));
        const { unmount } = render(renderToast({ id: 'toast-1' }));
        expect(screen.getByText('Completed — Short Term Goal: Full Front Lever')).toBeInTheDocument();

        act(() => fireEvent.click(screen.getByRole('button', { name: 'Write note' })));
        expect(toastMock.dismiss).toHaveBeenCalledWith('toast-1');
        expect(screen.getByRole('dialog')).toHaveTextContent('completion-note:g1');
        unmount();
    });

    it('says when a goal is no longer complete', () => {
        renderAnnouncer();
        act(() => publishGoalChanges('root-1', { completed: [], uncompleted: [goal] }));

        expect(toastMock.success).toHaveBeenCalledWith(
            'No longer complete — Short Term Goal: Full Front Lever',
            expect.objectContaining({ id: 'goal-uncompleted-g1' }),
        );
    });
});
