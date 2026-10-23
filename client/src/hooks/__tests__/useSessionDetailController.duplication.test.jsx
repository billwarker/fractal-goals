import { renderHook } from '@testing-library/react';
import { useSessionDetailController } from '../useSessionDetailController';

const state = vi.hoisted(() => ({ session: {}, activeQuery: {}, duplicate: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: () => ({ session: state.session, activityInstances: [] }),
    useActiveSessionActions: () => ({}),
    useActiveSessionUi: () => ({}),
}));
vi.mock('../useSessionQueries', () => ({ useActiveSession: () => state.activeQuery }));
vi.mock('../useGoalQueries', () => ({ useGoalActivities: () => ({}) }));
vi.mock('../useSessionOptionsMutations', () => ({ default: () => ({ duplicateSession: state.duplicate }) }));
vi.mock('../useSessionDetailUiState', () => ({ default: () => ({ setShowOptionsModal: vi.fn() }) }));
vi.mock('../useSessionDetailGoalAssociations', () => ({ useSessionDetailGoalAssociations: () => ({}) }));
vi.mock('../useSessionDetailNotes', () => ({ default: () => ({}) }));
vi.mock('../useSessionSidePaneViewModel', () => ({ default: () => ({}) }));
vi.mock('../useSequenceAdvanceUndo', () => ({ default: () => {} }));

describe('session duplication availability', () => {
    it.each([
        [false, false, true, null, false],
        [false, true, true, { id: 'current' }, false],
        [true, false, true, { id: 'another' }, false],
        [true, false, false, undefined, false],
        [true, false, true, null, true],
    ])('completed=%s paused=%s querySuccess=%s active=%j allows=%s', async (
        completed, isPaused, isSuccess, activeSession, expected,
    ) => {
        state.session = { attributes: { completed }, is_paused: isPaused };
        state.activeQuery = { isSuccess, data: activeSession };
        state.duplicate.mockReset().mockResolvedValue({ id: 'duplicate' });
        const navigate = vi.fn();
        const { result } = renderHook(() => useSessionDetailController({
            rootId: 'root-1', sessionId: 'current', navigate, isMobile: false,
        }));
        expect(result.current.canDuplicateSession).toBe(expected);
        await result.current.handleDuplicateSession();
        expect(state.duplicate).toHaveBeenCalledTimes(expected ? 1 : 0);
        expect(navigate).toHaveBeenCalledTimes(expected ? 1 : 0);
    });
});
