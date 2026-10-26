import React from 'react';
import { render, screen, within } from '@testing-library/react';
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

describe('plan comparison', () => {
    const definition = {
        id: 'bench', name: 'Bench', has_sets: true,
        metric_definitions: [
            { id: 'w', name: 'Weight', unit: 'kg', is_multiplicative: true, is_additive: false },
            { id: 'r', name: 'Reps', unit: 'reps', is_multiplicative: true },
        ],
    };
    const set = (w, r) => ({ metrics: [{ metric_id: 'w', value: w }, { metric_id: 'r', value: r }] });
    const props = {
        definition, value: { schema: 1, sets: [set(105, 5), set(100, 5)] },
        onChange: vi.fn(), idPrefix: 'p', active: false, alignKey: 't|a:bench#0',
    };

    const row = (label) => within(screen.getByLabelText('Activity summary metrics'))
        .getByText(label).closest('div');

    it("always shows the session page's total yield and best set, with changes only when compared", () => {
        const { container, rerender } = render(<PrescriptionEditor {...props} />);
        expect(row('Total yield:')).toHaveTextContent(/^Total yield:1025$/);
        expect(row('Best:')).toHaveTextContent('Set 1 = 525');
        expect(container.querySelector('[data-align-key="t|a:bench#0|summary#0"]')).not.toBeNull();
        expect(screen.queryByText(/[▲▼]/)).not.toBeInTheDocument();

        rerender(<PrescriptionEditor {...props} comparison={{ sets: [set(100, 5)] }} comparisonDate="2026-10-16" />);
        expect(screen.getByLabelText('Set 1 yield up 5% from Fri, Oct 16')).toHaveTextContent('▲5%');
        expect(screen.getByLabelText('Set 2 is new from Fri, Oct 16')).toBeInTheDocument();
        expect(row('Total yield:')).toHaveTextContent(/^Total yield:1025 \(▲105%\)$/);
        expect(row('Best:')).toHaveTextContent('Set 1 = 525');
    });

    it("shows changes in the session page's display mode: the activity's, else the fractal's", () => {
        const comparison = { sets: [set(100, 5)] };
        const { rerender } = render(
            <PrescriptionEditor {...props} comparison={comparison} progressSettings={{ delta_display_mode: 'absolute' }} />,
        );
        expect(screen.getByLabelText(/^Set 1 yield up \+25/)).toHaveTextContent('(+25)');
        expect(row('Total yield:')).toHaveTextContent('1025 (+525)');

        rerender(
            <PrescriptionEditor
                {...props}
                definition={{ ...definition, delta_display_mode: 'percent' }}
                comparison={comparison}
                progressSettings={{ delta_display_mode: 'absolute' }}
            />,
        );
        expect(row('Total yield:')).toHaveTextContent('1025 (▲105%)');
    });

    it('notes fewer sets than the comparison', () => {
        render(<PrescriptionEditor {...props} value={{ schema: 1, sets: [set(100, 5)] }} comparison={{ sets: [set(100, 5), set(100, 5)] }} comparisonDate="2026-10-16" />);
        expect(row('vs Fri, Oct 16:')).toHaveTextContent('−1 set');
        expect(row('Total yield:')).toHaveTextContent('(▼50%)');
    });

    it('shows 0% for values equal to the comparison, as right after a copy', () => {
        render(<PrescriptionEditor {...props} value={{ schema: 1, sets: [set(100, 5)] }} comparison={{ sets: [set(100, 5)] }} />);
        expect(screen.getByLabelText('Set 1 yield unchanged')).toHaveTextContent('(0%)');
        expect(screen.queryByText(/[▲▼]/)).not.toBeInTheDocument();
        expect(screen.queryByText('new')).not.toBeInTheDocument();
    });

    it('puts each value change beside its value, without the metric name', () => {
        const form = {
            id: 'hs', name: 'Handstand', has_sets: false,
            metric_definitions: [{ id: 'f', name: 'Form', unit: 'Rating' }, { id: 'h', name: 'Hold', unit: 's' }],
        };
        const { container } = render(
            <PrescriptionEditor
                {...props}
                definition={form}
                value={{ schema: 1, metrics: [{ metric_id: 'f', value: 9 }, { metric_id: 'h', value: 30 }] }}
                comparison={{ metrics: [{ metric_id: 'f', value: 7 }, { metric_id: 'h', value: 30 }] }}
            />,
        );
        const [formField, holdField] = container.querySelectorAll('label');
        expect(within(formField).getByLabelText('Handstand Rating up 28.6%')).toHaveTextContent(/^\(▲28\.6%\)$/);
        expect(within(holdField).getByLabelText('Handstand s unchanged')).toHaveTextContent('(0%)');
    });
});

describe('circuit plan comparison', () => {
    const hold = { id: 'fl', name: 'FL Holds', metric_definitions: [{ id: 't', name: 'Hold Time', unit: 's' }] };
    const pike = { id: 'pike', name: 'Pike', metric_definitions: [{ id: 'r', name: 'Reps', unit: 'count' }] };
    const round = (t, r) => ({ slots: [
        { slot_id: 'slot-fl', metrics: [{ metric_id: 't', value: t }] },
        { slot_id: 'slot-pike', metrics: [{ metric_id: 'r', value: r }] },
    ] });
    const props = {
        circuit: { name: 'Superset' }, onChange: vi.fn(), idPrefix: 'c', active: false,
        value: { rounds: [round(16.37, 10), round(18, 9)] },
        comparisonDate: '2026-10-16',
    };

    it('shows each member value change beside it, round by round', () => {
        render(
            <CircuitPrescriptionEditor
                {...props}
                slots={[
                    { id: 'slot-fl', activity_definition_id: 'fl', definition: hold },
                    { id: 'slot-pike', activity_definition_id: 'pike', definition: pike },
                ]}
                comparison={{ rounds: [round(16.37, 10), round(17.02, 9)] }}
            />,
        );
        expect(screen.getByLabelText('Round 1 FL Holds s unchanged from Fri, Oct 16')).toHaveTextContent('(0%)');
        expect(screen.getByLabelText('Round 1 Pike count unchanged from Fri, Oct 16')).toHaveTextContent('(0%)');
        expect(screen.getByLabelText(/^Round 2 FL Holds s up 5\.8/)).toHaveTextContent('(▲5.8%)');
    });

    it('pairs a logged run slot by its source slot and marks rounds the comparison lacks', () => {
        render(
            <CircuitPrescriptionEditor
                {...props}
                readOnly
                value={{ rounds: [
                    { slots: [{ slot_id: 'run-1', metrics: [{ metric_id: 't', value: 16.37 }] }] },
                    { slots: [{ slot_id: 'run-1', metrics: [{ metric_id: 't', value: 17 }] }] },
                ] }}
                slots={[{ id: 'run-1', source_slot_id: 'slot-fl', activity_definition_id: 'fl', definition: hold }]}
                comparison={{ rounds: [round(16.37, 10)] }}
            />,
        );
        expect(screen.getByLabelText('Round 1 FL Holds s unchanged from Fri, Oct 16')).toBeInTheDocument();
        expect(screen.getByLabelText('Round 2 is new from Fri, Oct 16')).toBeInTheDocument();
    });

    it('shows nothing without a comparison', () => {
        render(<CircuitPrescriptionEditor {...props} slots={[{ id: 'slot-fl', activity_definition_id: 'fl', definition: hold }]} />);
        expect(screen.queryByText(/%\)/)).not.toBeInTheDocument();
    });
});
