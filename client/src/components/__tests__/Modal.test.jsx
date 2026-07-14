import React, { useState } from 'react';
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

function RerenderingTextModal() {
    const [value, setValue] = useState('');
    return (
        <Modal isOpen onClose={() => {}} title="Delete Fractal Tree?">
            <label>Type DELETE to confirm<input value={value} onChange={(event) => setValue(event.target.value)} /></label>
        </Modal>
    );
}

function NestedModals({ onOuterClose, onInnerClose }) {
    const [innerOpen, setInnerOpen] = useState(true);
    return (
        <Modal isOpen onClose={onOuterClose} title="Outer modal">
            <Modal
                isOpen={innerOpen}
                stackLevel={1}
                onClose={() => {
                    setInnerOpen(false);
                    onInnerClose();
                }}
                title="Inner modal"
            >
                Inner content
            </Modal>
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

    it('traps keyboard focus within the dialog', () => {
        render(<Modal isOpen onClose={() => {}} title="Focus test" showCloseButton={false}><button>First</button><button>Last</button></Modal>);
        const first = screen.getByRole('button', { name: 'First' });
        const last = screen.getByRole('button', { name: 'Last' });
        last.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(first).toHaveFocus();
        first.focus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(last).toHaveFocus();
    });

    it('keeps focus in a confirmation input when each character rerenders the modal', () => {
        render(<RerenderingTextModal />);
        const input = screen.getByLabelText('Type DELETE to confirm');
        input.focus();
        for (const value of ['d', 'de', 'del', 'dele', 'delet', 'delete']) {
            fireEvent.change(input, { target: { value } });
            expect(input).toHaveFocus();
        }
    });

    it('only lets the topmost modal handle Escape', () => {
        const onOuterClose = vi.fn();
        const onInnerClose = vi.fn();
        render(<NestedModals onOuterClose={onOuterClose} onInnerClose={onInnerClose} />);

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onInnerClose).toHaveBeenCalledTimes(1);
        expect(onOuterClose).not.toHaveBeenCalled();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onOuterClose).toHaveBeenCalledTimes(1);
    });
});
