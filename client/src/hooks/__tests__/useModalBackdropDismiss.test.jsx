import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import {
    isTextEditingElement,
    useModalBackdropDismiss,
} from '../useModalBackdropDismiss';

function BackdropHarness({ onClose }) {
    const backdropHandlers = useModalBackdropDismiss(onClose);

    return (
        <div data-testid="backdrop" {...backdropHandlers}>
            <label>
                Name
                <input type="text" />
            </label>
        </div>
    );
}

describe('useModalBackdropDismiss', () => {
    it('identifies editable text controls', () => {
        const input = document.createElement('input');
        input.type = 'text';
        expect(isTextEditingElement(input)).toBe(true);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        expect(isTextEditingElement(checkbox)).toBe(false);

        const textarea = document.createElement('textarea');
        expect(isTextEditingElement(textarea)).toBe(true);

        textarea.readOnly = true;
        expect(isTextEditingElement(textarea)).toBe(false);
    });

    it('blocks the backdrop click that starts while a text field is focused', () => {
        const onClose = vi.fn();
        render(<BackdropHarness onClose={onClose} />);

        screen.getByLabelText('Name').focus();
        const backdrop = screen.getByTestId('backdrop');

        fireEvent.mouseDown(backdrop);
        screen.getByLabelText('Name').blur();
        fireEvent.click(backdrop);

        expect(onClose).not.toHaveBeenCalled();
    });

    it('allows a later backdrop click once text editing is no longer active', () => {
        const onClose = vi.fn();
        render(<BackdropHarness onClose={onClose} />);

        const backdrop = screen.getByTestId('backdrop');
        fireEvent.mouseDown(backdrop);
        fireEvent.click(backdrop);

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
