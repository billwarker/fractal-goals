// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { OP_STATE } from '../opKinds';
import { describeQueueForSupport, pickNextReady } from '../outboxQueue';

const pending = (overrides) => ({ state: OP_STATE.PENDING, nextAttemptAt: 0, ...overrides });

describe('outboxQueue', () => {
    it('picks the oldest change of the first session that is due', () => {
        const ops = [
            pending({ opId: 'a1', scope: 'a', seq: 1, nextAttemptAt: 5000 }),
            pending({ opId: 'a2', scope: 'a', seq: 2 }),
            pending({ opId: 'b1', scope: 'b', seq: 3 }),
        ];

        expect(pickNextReady(ops, 1000)).toEqual({ head: ops[2], wakeAt: 5000 });
        expect(pickNextReady(ops.slice(0, 2), 1000)).toEqual({ head: undefined, wakeAt: 5000 });
    });

    it('describes the queue for support without any content', () => {
        const ops = [pending({
            opId: 'secret-id', kind: 'note.create', url: '/root/sessions/s/notes', body: { content: 'private note' },
            meta: { note: { content: 'private note' } }, createdAt: new Date(0).toISOString(), attempts: 2,
            lastError: { status: 503, code: null, message: 'Service Unavailable' },
        })];
        const text = JSON.stringify(describeQueueForSupport({ ops, syncing: false, pausedForAuth: false, volatile: false, waitingForTab: false }, 60000));

        expect(text).not.toMatch(/private note|secret-id|\/root/);
        expect(JSON.parse(text).ops[0]).toMatchObject({ kind: 'note.create', attempts: 2, age_s: 60, error: { status: 503, code: null } });
    });
});
