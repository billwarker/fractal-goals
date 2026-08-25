import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import MetricCascadeButton from '../MetricCascadeButton';


it('renders the shared cascade contract and invokes its action', () => {
    const onClick = vi.fn();
    render(
        <MetricCascadeButton
            value={30}
            unit="Seconds"
            destinationLabel="sets"
            onClick={onClick}
        />,
    );

    const button = screen.getByRole('button', { name: 'Cascade Seconds' });
    expect(button).toHaveAttribute('title', 'Copy 30 Seconds to subsequent empty sets');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
});
