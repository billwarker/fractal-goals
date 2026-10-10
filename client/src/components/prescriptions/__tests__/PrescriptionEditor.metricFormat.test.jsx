import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
