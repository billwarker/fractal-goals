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
        expect(screen.getByRole('menu')).toHaveStyle({ position: 'fixed' });
        expect(screen.getByRole('menu').parentElement).toBe(document.body);
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
        expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
    });

    it('keeps the portalled menu interactive outside a clipped mobile header', () => {
        const onCreateGroup = vi.fn();
        render(
            <div data-testid="clipped-mobile-header">
                <ManageActivitiesCreateMenu
                    onCreateActivity={vi.fn()}
                    onCreateGroup={onCreateGroup}
                    onCreateCircuit={vi.fn()}
                />
            </div>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        const menu = screen.getByRole('menu', { name: 'Create' });
        expect(menu.parentElement).toBe(document.body);

        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Activity Group' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Activity Group' }));

        expect(onCreateGroup).toHaveBeenCalledOnce();
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
