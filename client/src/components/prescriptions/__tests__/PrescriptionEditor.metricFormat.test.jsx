import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import CircuitPrescriptionEditor from '../CircuitPrescriptionEditor';
import PrescriptionEditor from '../PrescriptionEditor';

describe('template prescription metric formats', () => {
    it.each([false, true])('reformats saved planned values without editing them (hasSets=%s)', (hasSets) => {
        const onChange = vi.fn();
        const metrics = [{ metric_id: 'binding-1', split_id: null, value: 12.75 }];
        const value = hasSets ? { schema: 1, sets: [{ metrics }] } : { schema: 1, metrics };
        const definition = (input_type, precision) => ({
            id: 'activity-1', name: 'Load', has_sets: hasSets,
            metric_definitions: [{ id: 'binding-1', name: 'Weight', unit: 'kg', input_type, precision }],
        });
        const props = { value, onChange, idPrefix: 'plan', active: false };
        const { rerender } = render(<PrescriptionEditor {...props} definition={definition('number', 2)} />);
        const input = screen.getByRole('textbox', { name: hasSets ? 'Set 1 planned Weight' : 'planned Weight' });
        expect(input).toHaveValue('12.75');

        rerender(<PrescriptionEditor {...props} definition={definition('integer', 0)} />);
        expect(input).toHaveValue('12');
        rerender(<PrescriptionEditor {...props} definition={definition('number', 3)} />);
        expect(input).toHaveValue('12.750');
        expect(onChange).not.toHaveBeenCalled();
        expect(metrics[0].value).toBe(12.75);
    });
});

describe('plan row alignment keys', () => {
    const weight = { id: 'w', name: 'Weight', unit: 'kg' };
    const alignKeys = (container) => [...container.querySelectorAll('[data-align-key]')]
        .map((row) => row.getAttribute('data-align-key'));

    it('marks the set header and each set only when given an item key', () => {
        const props = {
            definition: { id: 'bench', name: 'Bench', has_sets: true, metric_definitions: [weight] },
            value: { schema: 1, sets: [{ metrics: [] }, { metrics: [] }] },
            onChange: vi.fn(), idPrefix: 'p', active: false, readOnly: true,
        };
        const { container, rerender } = render(<PrescriptionEditor {...props} alignKey="t|a:bench#0" />);
        expect(alignKeys(container)).toEqual(['t|a:bench#0|sets-header#0', 't|a:bench#0|set#0', 't|a:bench#0|set#1']);

        rerender(<PrescriptionEditor {...props} />);
        expect(alignKeys(container)).toEqual([]);
    });

    it('marks each round and its activities by activity, so logged and planned runs pair up', () => {
        const slots = [
            { id: 'run-slot-1', activity_definition_id: 'fl', definition: { id: 'fl', name: 'FL', metric_definitions: [weight] } },
            { id: 'run-slot-2', activity_definition_id: 'fl', definition: { id: 'fl', name: 'FL', metric_definitions: [weight] } },
        ];
        const { container } = render(
            <CircuitPrescriptionEditor
                circuit={{ name: 'Superset' }} slots={slots} readOnly active={false}
                value={{ rounds: [{ slots: [] }] }} onChange={vi.fn()} idPrefix="c" alignKey="t|c:circ#0"
            />,
        );
        expect(alignKeys(container)).toEqual([
            't|c:circ#0|round#0',
            't|c:circ#0|round#0|round-slot:fl:0#0',
            't|c:circ#0|round#0|round-slot:fl:1#0',
        ]);
    });
});
