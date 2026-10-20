import { renderHook, waitFor } from '@testing-library/react';

import useSequenceAdvanceUndo from '../useSequenceAdvanceUndo';

const { api, toasts, refresh } = vi.hoisted(() => ({
    api: { getGoalSequence: vi.fn(), holdSequenceStep: vi.fn() },
    toasts: [],
    refresh: vi.fn(),
}));
vi.mock('../../utils/api', () => ({ fractalApi: api }));
vi.mock('../../utils/goalTreeCache', () => ({ refreshGoalReadModels: refresh }));
vi.mock('../../components/atoms/ActionToast', () => ({ showActionToast: (props) => toasts.push(props) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));

const tree = (completed, source = 'condition') => ({
    id: 'root',
    children: [{ id: 'a', name: 'Lift 225', completed, completion_state: { source }, sequence_track_id: 't', children: [] }],
});

describe('useSequenceAdvanceUndo', () => {
    beforeEach(() => {
        toasts.length = 0;
        vi.clearAllMocks();
        api.getGoalSequence.mockResolvedValue({ data: { next_step_begun_by_this: { id: 'b', name: 'Lift 245' } } });
        api.holdSequenceStep.mockResolvedValue({});
    });

    it('offers Undo when a condition completes a step and its sequence begins the next', async () => {
        const { rerender } = renderHook(({ goalTree }) => useSequenceAdvanceUndo({ rootId: 'r', goalTree }), {
            initialProps: { goalTree: tree(false) },
        });
        rerender({ goalTree: tree(true) });

        await waitFor(() => expect(toasts).toHaveLength(1));
        expect(toasts[0].message).toBe('Lift 225 is complete, so Lift 245 has begun.');
        await toasts[0].onAction();
        expect(api.holdSequenceStep).toHaveBeenCalledWith('r', 'b');
        expect(refresh).toHaveBeenCalled();
    });

    it('stays quiet for goals already complete on load, manual completions, and steps nothing began', async () => {
        const { rerender } = renderHook(({ goalTree }) => useSequenceAdvanceUndo({ rootId: 'r', goalTree }), {
            initialProps: { goalTree: tree(true) },
        });
        rerender({ goalTree: tree(true) });
        rerender({ goalTree: tree(false, 'manual') });
        rerender({ goalTree: tree(true, 'manual') });
        expect(api.getGoalSequence).not.toHaveBeenCalled();

        api.getGoalSequence.mockResolvedValue({ data: { next_step_begun_by_this: null } });
        rerender({ goalTree: tree(false) });
        rerender({ goalTree: tree(true) });
        await waitFor(() => expect(api.getGoalSequence).toHaveBeenCalledTimes(1));
        expect(toasts).toHaveLength(0);
    });
});
