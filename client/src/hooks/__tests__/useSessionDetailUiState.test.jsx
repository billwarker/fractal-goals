import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import useSessionDetailUiState from '../useSessionDetailUiState';

describe('useSessionDetailUiState', () => {
    it('opens focused activity goals in details mode because hierarchy lives there', () => {
        const setSidePaneMode = vi.fn();
        const selectedActivity = { id: 'inst-1', activity_definition_id: 'activity-1' };

        const { result } = renderHook(() => useSessionDetailUiState({
            isMobile: true,
            addActivity: vi.fn(),
            setSidePaneMode,
        }));

        act(() => {
            result.current.handleOpenGoals(selectedActivity);
        });

        expect(result.current.selectedActivity).toBe(selectedActivity);
        expect(setSidePaneMode).toHaveBeenCalledWith('details');
        expect(result.current.isMobilePaneOpen).toBe(true);
    });

    it('still opens the association modal for associate contexts', () => {
        const setSidePaneMode = vi.fn();
        const context = { type: 'associate', activityDefinitionId: 'activity-1' };

        const { result } = renderHook(() => useSessionDetailUiState({
            isMobile: false,
            addActivity: vi.fn(),
            setSidePaneMode,
        }));

        act(() => {
            result.current.handleOpenGoals(null, context);
        });

        expect(result.current.associationContext).toBe(context);
        expect(result.current.showAssociationModal).toBe(true);
        expect(setSidePaneMode).not.toHaveBeenCalled();
    });
});
