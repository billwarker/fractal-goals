import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import SessionDetailMobileDock from '../SessionDetailMobileDock';

describe('SessionDetailMobileDock', () => {
    it('routes mode changes through the shared two-mode handler', () => {
        const onModeSelect = vi.fn();

        render(
            <SessionDetailMobileDock
                sidePaneMode="details"
                onModeSelect={onModeSelect}
            />
        );

        expect(screen.queryByRole('button', { name: 'Goals' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Details' }).className).toMatch(/mobileDockTabActive/);

        fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));

        expect(onModeSelect).toHaveBeenCalledWith('timeline');
    });
});
