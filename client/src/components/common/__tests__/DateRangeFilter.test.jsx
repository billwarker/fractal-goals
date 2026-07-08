import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import DateRangeFilter from '../DateRangeFilter';
import { presetToRange, toISODate } from '../../../utils/dateRange';

function ControlledFilter({ initial = { start: null, end: null }, presets, onChange }) {
    const [value, setValue] = useState(initial);
    return (
        <DateRangeFilter
            value={value}
            onChange={(range) => {
                setValue(range);
                onChange?.(range);
            }}
            presets={presets}
        />
    );
}

describe('DateRangeFilter', () => {
    it('emits the preset span when a chip is clicked', () => {
        const onChange = vi.fn();
        render(<ControlledFilter onChange={onChange} />);

        fireEvent.click(screen.getByRole('button', { name: '7D' }));

        expect(onChange).toHaveBeenCalledWith(presetToRange('7d'));
    });

    it('emits an open range for All', () => {
        const onChange = vi.fn();
        render(<ControlledFilter initial={presetToRange('7d')} onChange={onChange} />);

        fireEvent.click(screen.getByRole('button', { name: 'All' }));

        expect(onChange).toHaveBeenCalledWith({ start: null, end: null });
    });

    it('shows date inputs in custom mode and edits both sides', () => {
        const onChange = vi.fn();
        render(<ControlledFilter onChange={onChange} />);

        fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
        expect(onChange).toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-06-01' } });
        fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-06-14' } });

        const lastRange = onChange.mock.calls.at(-1)[0];
        expect(lastRange.start).toBe('2026-06-01');
        expect(lastRange.end).toBe('2026-06-14');
    });

    it('keeps custom mode sticky even when dates match a preset span', () => {
        render(<ControlledFilter />);

        fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
        const sevenDay = presetToRange('7d');
        fireEvent.change(screen.getByLabelText('Start'), { target: { value: sevenDay.start } });
        fireEvent.change(screen.getByLabelText('End'), { target: { value: sevenDay.end } });

        // Inputs stay visible: custom remains the selected mode.
        expect(screen.getByLabelText('Start')).toBeInTheDocument();
    });

    it('renders only the requested presets', () => {
        render(<ControlledFilter presets={['7d', '30d', 'custom']} />);

        expect(screen.getByRole('button', { name: '7D' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '30D' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '1Y' })).not.toBeInTheDocument();
    });
});
