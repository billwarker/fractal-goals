import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import MetricValueEditor from '../../sessionDetail/MetricValueEditor';
import { evaluateArithmeticExpression, normalizeMetricValueForStorage } from '../../../utils/sessionActivityMetrics';

const weight = { id: 'w', name: 'Weight', unit: 'kg', input_type: 'number', precision: 2 };

function mockPointer(coarse) {
    window.matchMedia = vi.fn((query) => ({
        matches: coarse && query === '(pointer: coarse)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }));
}

function renderEditor(props = {}) {
    const onDraftChange = vi.fn();
    const onCommit = vi.fn(() => true);
    render(
        <MetricValueEditor
            metricDef={weight}
            value=""
            onDraftChange={onDraftChange}
            onCommit={onCommit}
            {...props}
        />,
    );
    return { input: screen.getByLabelText('Weight'), onDraftChange, onCommit };
}

describe('MathKeyBar', () => {
    const originalMatchMedia = window.matchMedia;
    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    it('opens operator keys under a number field from the +− button beside it on a touch screen', () => {
        mockPointer(true);
        const { input } = renderEditor();
        // Focusing alone opens nothing: the keys come when asked for.
        fireEvent.focus(input);
        expect(screen.queryByRole('toolbar', { name: 'Math keys' })).not.toBeInTheDocument();
        const toggle = screen.getByRole('button', { name: 'Show math keys' });
        expect(fireEvent.pointerDown(toggle)).toBe(false);
        fireEvent.click(toggle);
        expect(screen.getByRole('toolbar', { name: 'Math keys' })).toBeInTheDocument();
        expect(input).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Hide math keys' })).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Hide math keys' }));
        expect(screen.queryByRole('toolbar', { name: 'Math keys' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show math keys' }));
        fireEvent.blur(input);
        expect(screen.queryByRole('toolbar', { name: 'Math keys' })).not.toBeInTheDocument();
    });

    it('stays away on a mouse and keyboard', () => {
        mockPointer(false);
        renderEditor();
        expect(screen.queryByRole('button', { name: 'Show math keys' })).not.toBeInTheDocument();
    });

    it('stays away for duration and read-only fields on a touch screen', () => {
        mockPointer(true);
        render(<MetricValueEditor metricDef={{ id: 'd', name: 'Time', input_type: 'duration' }} value="" onDraftChange={vi.fn()} onCommit={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Show math keys' })).not.toBeInTheDocument();
        render(<MetricValueEditor metricDef={{ ...weight, id: 'r', name: 'Reps' }} value="" readOnly onDraftChange={vi.fn()} onCommit={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Show math keys' })).not.toBeInTheDocument();
    });

    it('types an operator at the caret as the field’s own input, then "=" puts in the result', () => {
        mockPointer(true);
        const { input, onDraftChange } = renderEditor();
        fireEvent.focus(input);
        fireEvent.click(screen.getByRole('button', { name: 'Show math keys' }));
        fireEvent.change(input, { target: { value: '2.54' } });
        input.setSelectionRange(3, 3);
        // Keys never take focus from the field.
        const times = screen.getByRole('button', { name: 'Times' });
        expect(fireEvent.pointerDown(times)).toBe(false);
        expect(fireEvent.mouseDown(times)).toBe(false);
        fireEvent.click(times);
        expect(input.value).toBe('2.5×4');
        expect(input.selectionStart).toBe(4);
        expect(onDraftChange).toHaveBeenLastCalledWith('2.5×4');

        const equals = screen.getByRole('button', { name: 'Equals 10' });
        fireEvent.click(equals);
        expect(input.value).toBe('10');
        expect(onDraftChange).toHaveBeenLastCalledWith('10');
        expect(screen.getByRole('button', { name: 'Equals' })).toBeDisabled();
    });
});

describe('arithmetic with typographic operators', () => {
    it('reads × ÷ − as * / -', () => {
        expect(evaluateArithmeticExpression('2.5×4')).toBe(10);
        expect(evaluateArithmeticExpression('(5+5)÷2')).toBe(5);
        expect(evaluateArithmeticExpression('100 − 2.5')).toBe(97.5);
        expect(normalizeMetricValueForStorage({ input_type: 'integer' }, '3×3')).toBe('9');
        expect(normalizeMetricValueForStorage(weight, '2.5×4')).toBe('10');
    });
});
