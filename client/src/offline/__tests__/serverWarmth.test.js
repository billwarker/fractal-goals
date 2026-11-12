// @vitest-environment node
import { SLOW_REQUEST_MS, isServerSlow, resetServerWarmthForTests, settleRequest, trackRequest } from '../serverWarmth';

describe('serverWarmth', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetServerWarmthForTests();
    });

    afterEach(() => vi.useRealTimers());

    it('flags a read still waiting past the threshold, and clears it when it answers', () => {
        const config = { method: 'get' };
        trackRequest(config);
        vi.advanceTimersByTime(SLOW_REQUEST_MS - 1);
        expect(isServerSlow()).toBe(false);
        vi.advanceTimersByTime(1);
        expect(isServerSlow()).toBe(true);
        settleRequest(config);
        expect(isServerSlow()).toBe(false);
    });

    it('ignores fast reads, writes, and requests that opt out', () => {
        const fast = { method: 'get' };
        trackRequest(fast);
        settleRequest(fast);
        trackRequest({ method: 'post' });
        trackRequest({ method: 'get', _skipWarmth: true });
        vi.advanceTimersByTime(SLOW_REQUEST_MS * 2);
        expect(isServerSlow()).toBe(false);
    });

    it('stays slow until every slow read has settled', () => {
        const first = { method: 'get' };
        const second = { method: 'get' };
        trackRequest(first);
        trackRequest(second);
        vi.advanceTimersByTime(SLOW_REQUEST_MS);
        settleRequest(first);
        expect(isServerSlow()).toBe(true);
        settleRequest(second);
        settleRequest(second);
        expect(isServerSlow()).toBe(false);
    });

    it('does not leak a slow mark when a request is retried with the same config', () => {
        const config = { method: 'get' };
        trackRequest(config);
        vi.advanceTimersByTime(SLOW_REQUEST_MS);
        trackRequest(config);
        settleRequest(config);
        vi.advanceTimersByTime(SLOW_REQUEST_MS * 2);
        expect(isServerSlow()).toBe(false);
    });
});
