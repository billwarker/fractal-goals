import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ManageActivitiesCreateMenu from '../ManageActivitiesCreateMenu';


describe('ManageActivitiesCreateMenu', () => {
    it('routes each create choice and closes the menu', () => {
        const handlers = {
            onCreateActivity: vi.fn(),
            onCreateGroup: vi.fn(),
            onCreateCircuit: vi.fn(),
        };
        const { rerender } = render(<ManageActivitiesCreateMenu {...handlers} />);
        const trigger = screen.getByRole('button', { name: 'Create' });

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Activity' }));
        expect(handlers.onCreateActivity).toHaveBeenCalledOnce();
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();

        rerender(<ManageActivitiesCreateMenu {...handlers} />);
        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Activity Group' }));
        expect(handlers.onCreateGroup).toHaveBeenCalledOnce();

        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Activity Circuit' }));
        expect(handlers.onCreateCircuit).toHaveBeenCalledOnce();
    });

    it('closes on Escape without selecting an option', () => {
        const onCreateActivity = vi.fn();
        render(
            <ManageActivitiesCreateMenu
                onCreateActivity={onCreateActivity}
                onCreateGroup={vi.fn()}
                onCreateCircuit={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(onCreateActivity).not.toHaveBeenCalled();
    });
});
