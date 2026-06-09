import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import Modal from '../atoms/Modal';

function TextModal({ onClose }) {
    return (
        <Modal isOpen={true} onClose={onClose} title="Edit Activity">
            <label>
                Activity Name
                <input type="text" />
            </label>
        </Modal>
    );
}

describe('Modal', () => {
    it('does not close on backdrop click while a text field is focused', () => {
        const onClose = vi.fn();
        render(<TextModal onClose={onClose} />);

        screen.getByLabelText('Activity Name').focus();
        const dialog = screen.getByRole('dialog');

        fireEvent.mouseDown(dialog);
        screen.getByLabelText('Activity Name').blur();
        fireEvent.click(dialog);

        expect(onClose).not.toHaveBeenCalled();
    });

    it('still closes on backdrop click when no text field is active', () => {
        const onClose = vi.fn();
        render(<TextModal onClose={onClose} />);

        const dialog = screen.getByRole('dialog');
        fireEvent.mouseDown(dialog);
        fireEvent.click(dialog);

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
