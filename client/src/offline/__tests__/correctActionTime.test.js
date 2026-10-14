import { describe, expect, it, vi } from 'vitest';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({}) }));

import { correctActionTime } from '../engine';

describe('correctActionTime', () => {
    it('shifts occurred_at by the measured offset and leaves other bodies alone', () => {
        const body = { occurred_at: '2026-10-14T10:00:00.000Z', session_id: 's' };
        expect(correctActionTime(body, 90_000)).toEqual({ occurred_at: '2026-10-14T10:01:30.000Z', session_id: 's' });
        expect(correctActionTime(body, 0)).toBe(body);
        expect(correctActionTime({ metrics: [] }, 90_000)).toEqual({ metrics: [] });
        expect(correctActionTime(null, 90_000)).toBeNull();
    });
});
