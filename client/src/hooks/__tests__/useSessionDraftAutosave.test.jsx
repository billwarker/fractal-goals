import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useSessionDraftAutosave from '../useSessionDraftAutosave';

const INITIAL_DATA = {
    sections: [{ name: 'Main', activity_ids: ['instance-1'] }],
};

function createProps(saveSessionData) {
    return {
        rootId: 'root-1',
        sessionId: 'session-1',
        normalizedSessionData: INITIAL_DATA,
        saveSessionData,
        setAutoSaveStatus: vi.fn(),
        scheduleStatusClear: vi.fn(),
        instanceQueuesRef: { current: new Map() },
        instanceRollbackRef: { current: new Map() },
        setShowActivitySelector: vi.fn(),
        setDraggedItem: vi.fn(),
        setSidePaneMode: vi.fn(),
    };
}

async function advance(ms) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

describe('useSessionDraftAutosave', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not save the server payload during initialization', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        renderHook(() => useSessionDraftAutosave(createProps(save)));

        await advance(1500);

        expect(save).not.toHaveBeenCalled();
    });

    it('saves an edit once across parent rerenders and still saves later edits', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const saveSessionData = (data) => save(data);
        const stableProps = createProps(saveSessionData);
        const { result, rerender } = renderHook(
            ({ renderVersion }) => {
                void renderVersion;
                return useSessionDraftAutosave(stableProps);
            },
            { initialProps: { renderVersion: 1 } },
        );

        await advance(500);

        act(() => {
            result.current.updateSessionDataDraft((current) => ({
                ...current,
                title: 'First edit',
            }));
        });
        await advance(800);
        expect(save).toHaveBeenCalledTimes(1);

        rerender({ renderVersion: 2 });
        await advance(800);
        expect(save).toHaveBeenCalledTimes(1);

        act(() => {
            result.current.updateSessionDataDraft((current) => ({
                ...current,
                title: 'Second edit',
            }));
        });
        await advance(800);

        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Second edit' }));
    });
});
