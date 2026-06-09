import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ModalBackdrop from '../atoms/ModalBackdrop';

function BackdropWithInput({ onClose, closeOnBackdrop = true }) {
    return (
        <ModalBackdrop
            className="test-backdrop"
            closeOnBackdrop={closeOnBackdrop}
            data-testid="backdrop"
            onClose={onClose}
        >
            <label>
                Name
                <input type="text" />
            </label>
        </ModalBackdrop>
    );
}

describe('ModalBackdrop', () => {
    it('blocks backdrop dismissal when a text field is focused', () => {
        const onClose = vi.fn();
        render(<BackdropWithInput onClose={onClose} />);

        screen.getByLabelText('Name').focus();
        const backdrop = screen.getByTestId('backdrop');

        fireEvent.mouseDown(backdrop);
        screen.getByLabelText('Name').blur();
        fireEvent.click(backdrop);

        expect(onClose).not.toHaveBeenCalled();
    });

    it('dismisses from backdrop clicks when no text field is active', () => {
        const onClose = vi.fn();
        render(<BackdropWithInput onClose={onClose} />);

        const backdrop = screen.getByTestId('backdrop');
        fireEvent.mouseDown(backdrop);
        fireEvent.click(backdrop);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('can disable backdrop dismissal entirely', () => {
        const onClose = vi.fn();
        render(<BackdropWithInput closeOnBackdrop={false} onClose={onClose} />);

        const backdrop = screen.getByTestId('backdrop');
        fireEvent.mouseDown(backdrop);
        fireEvent.click(backdrop);

        expect(onClose).not.toHaveBeenCalled();
    });
});
