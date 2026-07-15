import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import LandingExampleOrderControls from '../LandingExampleOrderControls';

const styles = {
    landingExampleActions: 'actions',
    landingExampleHeader: 'header',
    landingExampleIdentity: 'identity',
    landingExampleIndex: 'index',
    landingExampleRemoveButton: 'remove',
};

describe('LandingExampleOrderControls', () => {
    it('renders a compact accessible position control and delegates actions', () => {
        const onMove = vi.fn();
        const onRemove = vi.fn();
        render(<LandingExampleOrderControls example={{ root_id: 'root-2', label: 'Strength' }}
            index={1} total={3} name="Strength tracker" onMove={onMove} onRemove={onRemove} styles={styles} />);

        expect(screen.getByLabelText('Position 2')).toHaveTextContent('2');
        fireEvent.click(screen.getByRole('button', { name: 'Move Strength up' }));
        fireEvent.click(screen.getByRole('button', { name: 'Move Strength down' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove Strength' }));

        expect(onMove).toHaveBeenNthCalledWith(1, 'root-2', -1);
        expect(onMove).toHaveBeenNthCalledWith(2, 'root-2', 1);
        expect(onRemove).toHaveBeenCalledWith('root-2');
    });

    it('disables movement at the list boundaries', () => {
        const { rerender } = render(<LandingExampleOrderControls example={{ root_id: 'root-1', label: 'First' }}
            index={0} total={2} name="First" onMove={vi.fn()} onRemove={vi.fn()} styles={styles} />);
        expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled();

        rerender(<LandingExampleOrderControls example={{ root_id: 'root-2', label: 'Last' }}
            index={1} total={2} name="Last" onMove={vi.fn()} onRemove={vi.fn()} styles={styles} />);
        expect(screen.getByRole('button', { name: 'Move Last down' })).toBeDisabled();
    });
});
