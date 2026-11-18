import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlowTreePreferences } from '../useFlowTreePreferences';

const ACCOUNT_VIEW = {
    scopedProgramId: 'program-1',
    viewSettings: { hideInactiveGoals: true },
};

function renderPreferences(props = {}) {
    return renderHook((hookProps) => useFlowTreePreferences(hookProps), {
        initialProps: { rootId: 'root-1', userId: 'user-1', defaultGoalsViewMode: 'tree', ...props },
    });
}

describe('useFlowTreePreferences', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('opens on the account view when this device has none (a published demo)', () => {
        const saveAccountView = vi.fn();
        const { result } = renderPreferences({ accountView: ACCOUNT_VIEW, saveAccountView });

        expect(result.current.viewSettings.hideInactiveGoals).toBe(true);
        expect(result.current.viewSettings.hideCompletedGoals).toBe(false);
        expect(result.current.scopedProgramId).toBe('program-1');
        expect(result.current.goalsViewMode).toBe('tree');
        expect(result.current.shouldPreservePreferencesRef.current).toBe(true);

        act(() => vi.advanceTimersByTime(2000));
        expect(saveAccountView).not.toHaveBeenCalled();
    });

    it('lets this device override the account view', () => {
        localStorage.setItem('flowtree-view-settings:user-1:root-1', JSON.stringify({
            viewSettings: { hideCompletedGoals: true },
        }));
        const { result } = renderPreferences({ accountView: ACCOUNT_VIEW });

        expect(result.current.viewSettings.hideCompletedGoals).toBe(true);
        expect(result.current.viewSettings.hideInactiveGoals).toBe(false);
    });

    it('saves filter changes to the account after a pause', () => {
        const saveAccountView = vi.fn();
        const { result } = renderPreferences({ saveAccountView });

        act(() => {
            result.current.setViewSettings((current) => ({ ...current, fadeInactiveBranches: true }));
        });
        act(() => vi.advanceTimersByTime(500));
        act(() => {
            result.current.setViewSettings((current) => ({ ...current, hideCompletedGoals: true }));
        });
        act(() => vi.advanceTimersByTime(1000));

        expect(saveAccountView).toHaveBeenCalledTimes(1);
        expect(saveAccountView).toHaveBeenCalledWith('root-1', {
            viewSettings: {
                fadeInactiveBranches: true,
                hideInactiveGoals: false,
                hideCompletedGoals: true,
                showMetricsOverlay: false,
            },
        });
    });
});
