import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCursor, getChangedIds, online } = vi.hoisted(() => ({
    getCursor: vi.fn(), getChangedIds: vi.fn(), online: { value: true },
}));
vi.mock('../../utils/api/syncApi', () => ({ syncApi: { getCursor, getChangedIds } }));
vi.mock('../../utils/api/core', () => ({ CLIENT_INSTANCE: 'me' }));
vi.mock('../../offline/connectivity', () => ({ isOnline: () => online.value, subscribeConnectivity: () => () => {} }));

import { POLL_MS, isAffected, startChangeListener } from '../changeListener';

const page = (changes, cursor, has_more = false) => ({ data: { changes, cursor, has_more } });
const change = (origin, root_id = 'root') => ({ type: 'goal', id: 'g', root_id, origin });

describe('changeListener', () => {
    let queryClient;
    let invalidate;
    let pending;
    let stop;

    beforeEach(() => {
        vi.useFakeTimers();
        getCursor.mockReset().mockResolvedValue({ data: { cursor: 'c0' } });
        getChangedIds.mockReset().mockResolvedValue(page([], 'c0'));
        online.value = true;
        pending = false;
        queryClient = new QueryClient();
        invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    });

    afterEach(() => {
        stop?.();
        vi.useRealTimers();
    });

    const start = async () => {
        stop = startChangeListener({ queryClient, hasPendingWrites: () => pending });
        await vi.advanceTimersByTimeAsync(0);
    };
    const tick = () => vi.advanceTimersByTimeAsync(POLL_MS);

    it('refreshes the changed fractal and moves on', async () => {
        getChangedIds.mockResolvedValueOnce(page([change('other')], 'c1'));
        await start();
        await tick();
        expect(invalidate).toHaveBeenCalledTimes(1);
        const { predicate } = invalidate.mock.calls[0][0];
        expect(predicate({ queryKey: ['goals', 'root'] })).toBe(true);
        expect(predicate({ queryKey: ['goals', 'elsewhere'] })).toBe(false);
        await tick();
        expect(getChangedIds).toHaveBeenLastCalledWith('c1');
    });

    it('ignores its own changes, across every page', async () => {
        getChangedIds.mockResolvedValueOnce(page([change('me')], 'c1', true)).mockResolvedValueOnce(page([change('me')], 'c2'));
        await start();
        await tick();
        expect(getChangedIds).toHaveBeenCalledTimes(2);
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('waits while a write is queued, then catches up', async () => {
        getChangedIds.mockImplementationOnce(async () => {
            pending = true;
            return page([change('other')], 'c1');
        });
        await start();
        await tick();
        expect(invalidate).not.toHaveBeenCalled();
        await tick();
        expect(getChangedIds).toHaveBeenCalledTimes(1);
        pending = false;
        getChangedIds.mockResolvedValueOnce(page([change('other')], 'c1'));
        await tick();
        expect(getChangedIds).toHaveBeenLastCalledWith('c0');
        expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it('takes a new position and refreshes everything when it is too far behind', async () => {
        getChangedIds.mockRejectedValueOnce({ response: { status: 410 } });
        getCursor.mockResolvedValueOnce({ data: { cursor: 'c0' } }).mockResolvedValueOnce({ data: { cursor: 'fresh' } });
        await start();
        await tick();
        expect(invalidate).toHaveBeenCalledTimes(1);
        await tick();
        expect(getChangedIds).toHaveBeenLastCalledWith('fresh');
    });

    it('backs off after failures and recovers', async () => {
        getChangedIds.mockRejectedValueOnce(new Error('500'));
        await start();
        await tick();
        await tick();
        expect(getChangedIds).toHaveBeenCalledTimes(1);
        await tick();
        expect(getChangedIds).toHaveBeenCalledTimes(2);
    });

    it('stays quiet offline and after stopping', async () => {
        online.value = false;
        await start();
        expect(getCursor).not.toHaveBeenCalled();
        online.value = true;
        stop();
        await tick();
        expect(getCursor).not.toHaveBeenCalled();
    });

    it.each([
        [['progress', 'comparison', 'i'], true],
        [['fractals', 'user'], true],
        [['logs', 'root'], false],
        [['ai-agent', 'context', 'root'], false],
        [['session', 'other', 's'], false],
    ])('%j affected: %s', (key, expected) => {
        expect(isAffected(key, new Set(['root']))).toBe(expected);
    });
});
