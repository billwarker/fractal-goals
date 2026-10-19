import { act, renderHook } from '@testing-library/react';

import { useSequenceCompletionChoice } from '../useGoalSequenceQueries';

const { queryState } = vi.hoisted(() => ({ queryState: { enabled: null, data: null } }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
    ...(await importOriginal()),
    useQuery: ({ enabled }) => {
        queryState.enabled = enabled;
        return { data: enabled ? queryState.data : undefined };
    },
}));

const sequenced = { id: 'g', sequence_track_id: 't' };

describe('useSequenceCompletionChoice', () => {
    beforeEach(() => {
        queryState.data = { next_step: { id: 'n', name: 'Next' }, next_step_begun_by_this: { id: 'm', name: 'Begun' } };
    });

    it('offers the next step when completing and defaults to beginning it', () => {
        const { result } = renderHook(() => useSequenceCompletionChoice({ rootId: 'r', goalId: 'g', goal: sequenced, viewState: 'complete-confirm' }));
        expect(result.current.nextStep).toEqual({ id: 'n', name: 'Next' });
        expect(result.current.resumedStep).toBeNull();
        expect(result.current.completionOptions).toEqual({ beginNext: true });
        act(() => result.current.setBeginNext(false));
        expect(result.current.completionOptions).toEqual({ beginNext: false });
    });

    it('offers the begun step when un-completing, and resets choices when the view changes', () => {
        const { result, rerender } = renderHook(
            ({ viewState }) => useSequenceCompletionChoice({ rootId: 'r', goalId: 'g', goal: sequenced, viewState }),
            { initialProps: { viewState: 'uncomplete-confirm' } },
        );
        expect(result.current.uncompletionOptions).toEqual({ pauseNext: true });
        act(() => result.current.setPauseNext(false));
        rerender({ viewState: 'goal' });
        rerender({ viewState: 'uncomplete-confirm' });
        expect(result.current.uncompletionOptions).toEqual({ pauseNext: true });
    });

    it('does not fetch for unsequenced goals, read-only views or other views', () => {
        renderHook(() => useSequenceCompletionChoice({ rootId: 'r', goalId: 'g', goal: { id: 'g' }, viewState: 'complete-confirm' }));
        expect(queryState.enabled).toBe(false);
        renderHook(() => useSequenceCompletionChoice({ rootId: 'r', goalId: 'g', goal: sequenced, viewState: 'goal' }));
        expect(queryState.enabled).toBe(false);
        const { result } = renderHook(() => useSequenceCompletionChoice({ rootId: 'r', goalId: 'g', goal: sequenced, viewState: 'complete-confirm', readOnly: true }));
        expect(result.current.completionOptions).toBeNull();
    });
});
