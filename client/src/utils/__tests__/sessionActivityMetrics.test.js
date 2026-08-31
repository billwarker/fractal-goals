import { describe, expect, it } from 'vitest';

import {
    evaluateArithmeticExpression,
    formatMetricValueForInput,
    getMetricInputProps,
    normalizeMetricValueForStorage,
} from '../sessionActivityMetrics';

describe('sessionActivityMetrics arithmetic normalization', () => {
    it('evaluates simple arithmetic expressions', () => {
        expect(evaluateArithmeticExpression('5-2')).toBe(3);
        expect(evaluateArithmeticExpression('2 * (3 + 4)')).toBe(14);
    });

    it('applies integer truncation and min/max bounds after expression evaluation', () => {
        expect(normalizeMetricValueForStorage({ input_type: 'integer' }, '7 / 2')).toBe('3');
        expect(normalizeMetricValueForStorage({ input_type: 'number', min_value: 0, max_value: 10 }, '8 + 9')).toBe('10');
    });

    it('rejects invalid arithmetic and division by zero', () => {
        expect(normalizeMetricValueForStorage({ input_type: 'number' }, '5-')).toBeNull();
        expect(normalizeMetricValueForStorage({ input_type: 'number' }, '5 / 0')).toBeNull();
    });

    it('rejects non-decimal number strings and oversized expressions', () => {
        expect(normalizeMetricValueForStorage({ input_type: 'number' }, 'Infinity')).toBeNull();
        expect(normalizeMetricValueForStorage({ input_type: 'number' }, '0x10')).toBeNull();
        expect(evaluateArithmeticExpression('1+'.repeat(41))).toBeNull();
    });

    it('rounds decimal values to the configured precision and displays trailing places', () => {
        const metric = { input_type: 'number', precision: 2 };
        expect(normalizeMetricValueForStorage(metric, '1.236')).toBe('1.24');
        expect(formatMetricValueForInput(metric, 1.2)).toBe('1.20');
        expect(getMetricInputProps(metric).step).toBe(0.01);
    });

    it('parses and formats fractional duration seconds at configurable precision', () => {
        const metric = { input_type: 'duration', precision: 2 };
        expect(normalizeMetricValueForStorage(metric, '1:05.678')).toBe('65.68');
        expect(formatMetricValueForInput(metric, 65.6)).toBe('01:05.60');
        expect(getMetricInputProps(metric)).toEqual(expect.objectContaining({
            inputMode: 'decimal',
            placeholder: 'MM:SS.00',
        }));
    });
});
