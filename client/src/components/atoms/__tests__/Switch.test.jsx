import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import Switch from '../Switch';

describe('Switch', () => {
    it('reports its state and toggles to the opposite value', () => {
        const onChange = vi.fn();
        render(<Switch aria-label="Animated icons" checked onChange={onChange} />);
        const control = screen.getByRole('switch', { name: 'Animated icons' });
        expect(control).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(control);
        expect(onChange).toHaveBeenCalledWith(false);
    });

    it('does nothing while disabled', () => {
        const onChange = vi.fn();
        render(<Switch aria-label="Progress" checked={false} onChange={onChange} disabled />);
        fireEvent.click(screen.getByRole('switch'));
        expect(onChange).not.toHaveBeenCalled();
    });
});
