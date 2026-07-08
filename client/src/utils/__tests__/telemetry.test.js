import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { recordEvents } = vi.hoisted(() => ({
    recordEvents: vi.fn(),
}));

vi.mock('../api', () => ({
    telemetryApi: {
        recordEvents: (...args) => recordEvents(...args),
    },
}));

import {
    __telemetryTestHooks,
    extractRootIdFromPath,
    normalizeTelemetryPath,
    setTelemetryEnabled,
    trackEvent,
    trackPageView,
} from '../telemetry';

const ROOT_ID = '8f3c2a1b-4d5e-4f60-9a7b-1c2d3e4f5a6b';
const SESSION_ID = '11112222-3333-4444-5555-666677778888';

describe('normalizeTelemetryPath', () => {
    it('replaces the first uuid segment with :rootId and later ones with :id', () => {
        expect(normalizeTelemetryPath(`/${ROOT_ID}/session/${SESSION_ID}`)).toBe('/:rootId/session/:id');
        expect(normalizeTelemetryPath(`/${ROOT_ID}/goals`)).toBe('/:rootId/goals');
        expect(normalizeTelemetryPath('/admin')).toBe('/admin');
    });

    it('handles empty input', () => {
        expect(normalizeTelemetryPath(null)).toBe(null);
        expect(normalizeTelemetryPath('')).toBe(null);
    });
});

describe('extractRootIdFromPath', () => {
    it('returns the raw root id when the first segment is a uuid', () => {
        expect(extractRootIdFromPath(`/${ROOT_ID}/goals`)).toBe(ROOT_ID);
        expect(extractRootIdFromPath('/admin')).toBe(null);
    });
});

describe('telemetry queue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        recordEvents.mockResolvedValue({ data: { accepted: 1 } });
        __telemetryTestHooks.reset();
    });

    afterEach(() => {
        __telemetryTestHooks.reset();
    });

    it('drops events while disabled', () => {
        trackPageView(`/${ROOT_ID}/goals`);

        expect(__telemetryTestHooks.getQueue()).toHaveLength(0);
    });

    it('queues normalized page views while enabled', () => {
        setTelemetryEnabled(true);
        trackPageView(`/${ROOT_ID}/goals`);

        const queue = __telemetryTestHooks.getQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0].name).toBe('page_view');
        expect(queue[0].path).toBe('/:rootId/goals');
        expect(queue[0].root_id).toBe(ROOT_ID);
        expect(queue[0].ts).toBeTruthy();
    });

    it('flushes queued events through the API and clears the queue', async () => {
        setTelemetryEnabled(true);
        trackEvent('settings_opened');
        trackPageView(`/${ROOT_ID}/goals`);

        await __telemetryTestHooks.flush();

        expect(recordEvents).toHaveBeenCalledTimes(1);
        const payload = recordEvents.mock.calls[0][0];
        expect(payload.events).toHaveLength(2);
        expect(__telemetryTestHooks.getQueue()).toHaveLength(0);
    });

    it('drops the batch when the API call fails', async () => {
        recordEvents.mockRejectedValue(new Error('offline'));
        setTelemetryEnabled(true);
        trackEvent('settings_opened');

        await __telemetryTestHooks.flush();

        expect(__telemetryTestHooks.getQueue()).toHaveLength(0);
    });

    it('clears the queue when telemetry is disabled', () => {
        setTelemetryEnabled(true);
        trackEvent('settings_opened');
        setTelemetryEnabled(false);

        expect(__telemetryTestHooks.getQueue()).toHaveLength(0);
    });

    it('caps the queue length', () => {
        setTelemetryEnabled(true);
        for (let i = 0; i < 60; i += 1) {
            trackEvent('settings_opened');
        }

        expect(__telemetryTestHooks.getQueue().length).toBeLessThanOrEqual(40);
    });
});
