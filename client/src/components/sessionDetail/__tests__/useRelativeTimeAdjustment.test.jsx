import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import useRelativeTimeAdjustment from '../useRelativeTimeAdjustment';


function AdjustmentHarness({ onApply }) {
    const adjustment = useRelativeTimeAdjustment({
        timezone: 'UTC',
        onApply,
    });

    return (
        <div>
            {adjustment.renderToggle('start')}
            {adjustment.renderPanel('start', '2026-07-28 13:00:00')}
        </div>
    );
}


describe('useRelativeTimeAdjustment', () => {
    it('keeps a rejected save open and displays its inline error', async () => {
        const onApply = vi.fn().mockResolvedValue({
            error: 'Circuit timing overlaps another circuit',
        });
        render(<AdjustmentHarness onApply={onApply} />);

        fireEvent.click(screen.getByRole('button', { name: 'Adjust start time' }));
        fireEvent.change(screen.getByLabelText('Relative start adjustment'), {
            target: { value: '-10M' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        expect(await screen.findByText('Circuit timing overlaps another circuit')).toBeInTheDocument();
        expect(screen.getByLabelText('Relative start adjustment')).toBeInTheDocument();
    });
});
