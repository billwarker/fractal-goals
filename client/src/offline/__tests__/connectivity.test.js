import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { probeHealth } = vi.hoisted(() => ({ probeHealth: vi.fn() }));
vi.mock('../../utils/api/globalApi', () => ({ globalApi: { probeHealth } }));

import {
    checkConnectivity,
    getClockOffsetMs,
    getOfflineReason,
    isOnline,
    recordClockSample,
    reportRequestFailed,
    COLD_START_PROBE_TIMEOUT_MS,
    reportRequestSucceeded,
    resetConnectivityForTests,
    subscribeConnectivity,
} from '../connectivity';

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

describe('connectivity', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetConnectivityForTests();
        probeHealth.mockReset();
    });

    afterEach(() => {
        resetConnectivityForTests();
        vi.useRealTimers();
    });

    it('stays online when a request times out but the server answers a probe', async () => {
        probeHealth.mockResolvedValue({});
        const listener = vi.fn();
        subscribeConnectivity(listener);

        reportRequestFailed(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
        await vi.advanceTimersByTimeAsync(0);

        expect(probeHealth).toHaveBeenCalledTimes(1);
        expect(isOnline()).toBe(true);
        expect(listener).not.toHaveBeenCalled();
    });

    it('gives a timed-out request\'s probe long enough to cover a cold start', async () => {
        probeHealth.mockResolvedValue({});
        reportRequestFailed(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
        await Promise.resolve();
        expect(probeHealth).toHaveBeenCalledWith({ timeout: COLD_START_PROBE_TIMEOUT_MS });
        expect(COLD_START_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(20000);
    });

    it('goes offline when a timed-out request is followed by an unanswered probe', async () => {
        probeHealth.mockRejectedValue(networkError());

        reportRequestFailed(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
        await vi.advanceTimersByTimeAsync(0);

        expect(isOnline()).toBe(false);
        expect(getOfflineReason()).toBe('timeout');
    });

    it('goes offline on a transport failure and notifies subscribers', () => {
        const listener = vi.fn();
        subscribeConnectivity(listener);

        reportRequestFailed(networkError());

        expect(isOnline()).toBe(false);
        expect(listener).toHaveBeenCalledWith(false);
    });

    it('ignores server errors and cancellations', () => {
        reportRequestFailed(Object.assign(new Error('boom'), { response: { status: 500 } }));
        reportRequestFailed(Object.assign(new Error('aborted'), { code: 'ERR_CANCELED' }));

        expect(isOnline()).toBe(true);
    });

    it('comes back online on the next successful request', () => {
        reportRequestFailed(networkError());
        reportRequestSucceeded();

        expect(isOnline()).toBe(true);
    });

    it('probes with backoff until the API answers', async () => {
        const fetchMock = probeHealth
            .mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
            .mockResolvedValueOnce({ status: 200 });

        reportRequestFailed(networkError());
        await vi.advanceTimersByTimeAsync(2000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(isOnline()).toBe(false);

        await vi.advanceTimersByTimeAsync(4000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(isOnline()).toBe(true);
    });

    it('checks immediately when asked instead of waiting for the backoff', async () => {
        const fetchMock = probeHealth.mockResolvedValue({ status: 200 });
        reportRequestFailed(networkError());

        checkConnectivity();
        await vi.advanceTimersByTimeAsync(0);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(isOnline()).toBe(true);
    });
});

describe('clock offset', () => {
    beforeEach(() => resetConnectivityForTests());

    const sample = (deviceAheadMs, roundTrip = 100) => {
        const sentAt = 1_000_000;
        const truth = sentAt + roundTrip / 2 - deviceAheadMs;
        recordClockSample({
            sentAt,
            receivedAt: sentAt + roundTrip,
            serverDate: new Date(Math.floor(truth / 1000) * 1000).toUTCString(),
        });
    };

    it('measures how far the device clock is off from the server', () => {
        [0, 1, 2].forEach(() => sample(90_000));
        expect(Math.abs(getClockOffsetMs() + 90_000)).toBeLessThan(1000);
    });

    it('ignores slow round trips and noise under two seconds', () => {
        [0, 1, 2].forEach(() => sample(500));
        expect(getClockOffsetMs()).toBe(0);
        [0, 1, 2, 3].forEach(() => sample(-60_000, 5000));
        expect(getClockOffsetMs()).toBe(0);
    });
});
