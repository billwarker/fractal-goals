// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
    DURATION_HINT,
    parseDurationExpression,
    parseTimeExpression,
    resolveTimeExpression,
    TIME_ADJUSTMENT_HINT,
} from '../timeExpressions';

describe('parseTimeExpression', () => {
    it.each([
        ['30m', { base: null, seconds: 1800, signed: false }],
        ['+10m', { base: null, seconds: 600, signed: true }],
        ['-5M', { base: null, seconds: -300, signed: true }],
        ['+1h30m', { base: null, seconds: 5400, signed: true }],
        ['-1h 30m', { base: null, seconds: -5400, signed: true }],
        ['1.5h', { base: null, seconds: 5400, signed: false }],
        ['30m - 15s', { base: null, seconds: 1785, signed: false }],
        ['2:30', { base: null, seconds: 150, signed: false }],
        ['1:02:30', { base: null, seconds: 3750, signed: false }],
        ['90:00', { base: null, seconds: 5400, signed: false }],
        ['now', { base: 'now', seconds: 0, signed: false }],
        ['NOW-30M', { base: 'now', seconds: -1800, signed: false }],
        ['now + 1h5s', { base: 'now', seconds: 3605, signed: false }],
        ['  now  -  2m  ', { base: 'now', seconds: -120, signed: false }],
        ['-0s', { base: null, seconds: 0, signed: true }],
    ])('reads %j', (text, expected) => {
        expect(parseTimeExpression(text)).toEqual(expected);
    });

    it.each([
        '', '30', '+', 'now +', 'now 30m', '+10m now', '10m 5m', '30m1h', '1m1m', '2:60', '1:2:3:4',
        '+1d', 'nowish', '10m +', '5 minutes', null, undefined,
    ])('rejects %j', (text) => {
        expect(parseTimeExpression(text)).toBeNull();
    });
});

describe('parseDurationExpression', () => {
    it('reads a positive duration in any form', () => {
        expect(parseDurationExpression('30m')).toBe(1800);
        expect(parseDurationExpression('1h30m')).toBe(5400);
        expect(parseDurationExpression('2:30')).toBe(150);
        expect(parseDurationExpression('1s')).toBe(1);
    });

    it('refuses offsets, "now" and nothing at all', () => {
        expect(parseDurationExpression('+30m')).toBeNull();
        expect(parseDurationExpression('-30m')).toBeNull();
        expect(parseDurationExpression('now')).toBeNull();
        expect(parseDurationExpression('0m')).toBeNull();
        expect(parseDurationExpression('0:00')).toBeNull();
        expect(parseDurationExpression('5m - 10m')).toBeNull();
        expect(parseDurationExpression('')).toBeNull();
    });

    it('says what to type', () => {
        expect(DURATION_HINT).toBe('Use 30m, 1h30m, or 2:30');
    });
});

describe('resolveTimeExpression', () => {
    const nowMs = Date.parse('2026-11-16T12:00:00.000Z');
    const baseIso = '2026-11-16T09:00:00.000Z';

    it('offsets the field time with a signed expression', () => {
        expect(resolveTimeExpression('+10m', { baseIso, nowMs })).toBe('2026-11-16T09:10:00.000Z');
        expect(resolveTimeExpression('-1h30m', { baseIso, nowMs })).toBe('2026-11-16T07:30:00.000Z');
    });

    it('counts from the current time with "now"', () => {
        expect(resolveTimeExpression('now', { baseIso, nowMs })).toBe('2026-11-16T12:00:00.000Z');
        expect(resolveTimeExpression('now - 30m', { baseIso, nowMs })).toBe('2026-11-16T11:30:00.000Z');
        // A field with no time yet can still be set from now.
        expect(resolveTimeExpression('now-5m', { baseIso: null, nowMs })).toBe('2026-11-16T11:55:00.000Z');
    });

    it('refuses unsigned durations and offsets with no time to offset', () => {
        expect(() => resolveTimeExpression('30m', { baseIso, nowMs })).toThrow(TIME_ADJUSTMENT_HINT);
        expect(() => resolveTimeExpression('now 5m', { baseIso, nowMs })).toThrow(TIME_ADJUSTMENT_HINT);
        expect(() => resolveTimeExpression('+5m', { baseIso: null, nowMs })).toThrow('No time set yet. Use now or now - 30m');
    });
});
