import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ChartNumberField from '../ChartNumberField';

function setup() {
    const onChange = vi.fn();
    function Harness() {
        const [value, setValue] = useState(15);
        return (
            <ChartNumberField
                label="Limit"
                value={value}
                defaultValue={15}
                min={1}
                max={50}
                onChange={(next) => { onChange(next); setValue(next); }}
            />
        );
    }
    render(<Harness />);
    return { field: screen.getByLabelText('Limit'), onChange };
}

describe('ChartNumberField', () => {
    it('can be emptied and retyped, from 15 to 50', () => {
        const { field, onChange } = setup();
        fireEvent.change(field, { target: { value: '' } });
        expect(field).toHaveValue(null);
        expect(onChange).toHaveBeenLastCalledWith(15);
        fireEvent.change(field, { target: { value: '5' } });
        fireEvent.change(field, { target: { value: '50' } });
        expect(field).toHaveValue(50);
        expect(onChange).toHaveBeenLastCalledWith(50);
    });

    it('shows the default after being left empty', () => {
        const { field, onChange } = setup();
        fireEvent.change(field, { target: { value: '30' } });
        fireEvent.change(field, { target: { value: '' } });
        fireEvent.blur(field);
        expect(field).toHaveValue(15);
        expect(onChange).toHaveBeenLastCalledWith(15);
    });

    it('waits while out of range, and comes back in range when left', () => {
        const { field, onChange } = setup();
        fireEvent.change(field, { target: { value: '500' } });
        expect(field).toHaveValue(500);
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.blur(field);
        expect(field).toHaveValue(50);
        expect(onChange).toHaveBeenLastCalledWith(50);
        fireEvent.change(field, { target: { value: '0' } });
        fireEvent.blur(field);
        expect(field).toHaveValue(1);
    });
});
