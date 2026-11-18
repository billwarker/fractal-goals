import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { recordPublicEvents } = vi.hoisted(() => ({ recordPublicEvents: vi.fn() }));
vi.mock('../api/publicApi', () => ({ publicApi: { recordPublicEvents } }));

import { __publicTelemetryTestHooks, trackPublicEvent } from '../publicTelemetry';
import {
    __attributionTestHooks,
    attributionContext,
    getVisitAttribution,
    waitlistSource,
    withAttribution,
} from '../visitAttribution';

const at = (search, host = 'fractalgoals.com') => ({ search, host });

describe('visit attribution', () => {
    beforeEach(() => __attributionTestHooks.reset());

    it('reads campaign labels and an external referrer once per page', () => {
        const attribution = getVisitAttribution(at('?utm_source=News&utm_campaign=nov'), 'https://news.example.com/p/1');

        expect(attribution).toEqual({ utm_source: 'News', utm_campaign: 'nov', ref: 'news.example.com' });
        expect(getVisitAttribution(at(''), '')).toBe(attribution);
    });

    it('ignores the site referring to itself', () => {
        expect(getVisitAttribution(at(''), 'https://fractalgoals.com/')).toEqual({});
    });

    it('hands attribution on to the demo link without dropping its own parameters', () => {
        expect(withAttribution('/demo/r/goals?tour=1', { utm_source: 'news', ref: 'x.com' }))
            .toBe('/demo/r/goals?tour=1&utm_source=news&ref=x.com');
        expect(withAttribution('/demo/r/goals?tour=1', {})).toBe('/demo/r/goals?tour=1');
    });

    it('names the waitlist source as a code', () => {
        expect(waitlistSource('demo', { utm_source: 'Spring Sale!' })).toBe('utm:spring-sale');
        expect(waitlistSource('demo', { ref: 'News.Example.com' })).toBe('ref:news.example.com');
        expect(waitlistSource('landing', {})).toBe('landing');
    });

    it('sends the referrer as a host only', () => {
        expect(attributionContext({ ref: 'news.example.com', utm_medium: 'email' }))
            .toEqual({ utm_medium: 'email', referrer: 'https://news.example.com/' });
    });
});

describe('public telemetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        recordPublicEvents.mockReset().mockResolvedValue({ data: { accepted: 1 } });
        __publicTelemetryTestHooks.reset();
        __attributionTestHooks.reset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('batches events briefly and sends them with the page path', async () => {
        trackPublicEvent('landing_view');
        trackPublicEvent('waitlist_opened', { source: 'landing' });
        expect(recordPublicEvents).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1000);

        const [payload, options] = recordPublicEvents.mock.calls[0];
        expect(payload.events).toEqual([{ name: 'landing_view' }, { name: 'waitlist_opened', props: { source: 'landing' } }]);
        expect(payload.context.path).toBe(window.location.pathname);
        expect(options).toEqual({ keepalive: false });
    });

    it('sends at once with keepalive when the page goes away', () => {
        trackPublicEvent('invite_link_opened', { source: 'landing' });
        window.dispatchEvent(new Event('pagehide'));

        expect(recordPublicEvents).toHaveBeenCalledWith(expect.any(Object), { keepalive: true });
    });

    it('sends nothing while the browser asks not to be tracked', async () => {
        vi.stubGlobal('navigator', { ...navigator, doNotTrack: '1' });
        trackPublicEvent('landing_view');
        await vi.advanceTimersByTimeAsync(1000);

        expect(__publicTelemetryTestHooks.getQueue()).toHaveLength(0);
        expect(recordPublicEvents).not.toHaveBeenCalled();
    });

    it('never lets a failed send reach the page', async () => {
        recordPublicEvents.mockRejectedValue(new Error('offline'));
        trackPublicEvent('landing_view');

        await expect(__publicTelemetryTestHooks.flush()).resolves.toBeUndefined();
    });
});
