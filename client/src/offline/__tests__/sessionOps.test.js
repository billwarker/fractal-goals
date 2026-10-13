import { describe, expect, it } from 'vitest';

import {
    activeWorkConflictError,
    applySessionPause,
    applySessionResume,
    applyTimerAction,
    buildInstanceUpdateRequest,
    findRunningInstance,
    instanceCoalesceKey,
} from '../sessionOps';

const T0 = '2026-10-13T10:00:00.000Z';
const T1 = '2026-10-13T10:05:00.000Z';
const T2 = '2026-10-13T10:08:00.000Z';

describe('buildInstanceUpdateRequest', () => {
    const instance = { id: 'i1', activity_definition_id: 'def-1' };

    it('sends metric edits to the metrics endpoint with numeric values and no blanks', () => {
        const request = buildInstanceUpdateRequest({
            rootId: 'r', sessionId: 's', instance,
            updates: { metrics: [
                { metric_id: 'm1', value: ' 82.5 ' },
                { metric_definition_id: 'm2', value: '' },
                { metric_id: 'm3', value: 'felt good', split_definition_id: 'left' },
            ] },
        });
        expect(request).toEqual({
            method: 'put',
            url: '/r/sessions/s/activities/i1/metrics',
            body: { metrics: [
                { value: 82.5, metric_id: 'm1', split_id: null },
                { value: 'felt good', metric_id: 'm3', split_id: 'left' },
            ] },
        });
    });

    it('sends other edits to the instance endpoint and strips empty set metrics', () => {
        const request = buildInstanceUpdateRequest({
            rootId: 'r', sessionId: 's', instance,
            updates: { sets: [{ id: 'set-1', metrics: [{ metric_id: 'm1', value: '' }, { metric_id: 'm2', value: 5 }] }] },
        });
        expect(request.url).toBe('/r/activity-instances/i1');
        expect(request.body).toMatchObject({ session_id: 's', activity_definition_id: 'def-1' });
        expect(request.body.sets[0].metrics).toEqual([{ metric_id: 'm2', value: 5 }]);
    });

    it('coalesces per instance and field set', () => {
        expect(instanceCoalesceKey('i1', { sets: [], completed: true })).toBe('instance:i1:completed,sets');
        expect(instanceCoalesceKey('i1', { metrics: [] })).not.toBe(instanceCoalesceKey('i1', { sets: [] }));
    });
});

describe('timer patches', () => {
    const idle = { id: 'a', name: 'Bench', time_start: null, time_stop: null, completed: false, total_paused_seconds: 0 };
    const running = { id: 'b', name: 'Row', time_start: T0, time_stop: null, completed: false, total_paused_seconds: 0 };

    it('starts at the tap time', () => {
        const [started] = applyTimerAction([idle], { instanceId: 'a', action: 'start', at: T1 });
        expect(started).toMatchObject({ time_start: T1, time_stop: null, completed: false });
    });

    it('completes with duration net of pauses', () => {
        const paused = { ...running, total_paused_seconds: 60 };
        const [done] = applyTimerAction([paused], { instanceId: 'b', action: 'complete', at: T1 });
        expect(done).toMatchObject({ time_stop: T1, completed: true, duration_seconds: 240 });
    });

    it('switching completes whatever was running', () => {
        const next = applyTimerAction([idle, running], {
            instanceId: 'a', action: 'start', at: T1, extraData: { switch: true },
        });
        expect(next[1]).toMatchObject({ completed: true, time_stop: T1 });
        expect(next[0].time_start).toBe(T1);
    });

    it('detects a running instance and builds the server conflict shape', () => {
        expect(findRunningInstance([idle, running], 'a')).toBe(running);
        expect(findRunningInstance([idle, running], 'b')).toBeNull();
        const error = activeWorkConflictError(running);
        expect(error.response.data).toMatchObject({
            code: 'active_work_exists',
            active_work: { activity_instance_id: 'b', activity_name: 'Row' },
        });
    });
});

describe('session pause and resume patches', () => {
    it('pauses the session and its running instance, then accrues paused time on resume', () => {
        const session = { id: 's', is_paused: false, total_paused_seconds: 0 };
        const instances = [{ id: 'b', time_start: T0, time_stop: null, completed: false, total_paused_seconds: 0 }];

        const paused = applySessionPause(session, instances, T1);
        expect(paused.session).toMatchObject({ is_paused: true, last_paused_at: T1 });
        expect(paused.instances[0]).toMatchObject({ is_paused: true, last_paused_at: T1 });

        const resumed = applySessionResume(paused.session, paused.instances, T2);
        expect(resumed.session).toMatchObject({ is_paused: false, total_paused_seconds: 180 });
        expect(resumed.instances[0]).toMatchObject({ is_paused: false, total_paused_seconds: 180 });
    });
});
