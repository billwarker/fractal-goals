import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import ModalBackdrop from '../atoms/ModalBackdrop';
import styles from './ProgramSidePane.module.css';

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

function ProgramMobileSidePane({ children, onClose }) {
    const dialogRef = useRef(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const focusFrame = window.requestAnimationFrame(() => {
            const firstFocusable = dialogRef.current?.querySelector(FOCUSABLE_SELECTOR);
            (firstFocusable || dialogRef.current)?.focus();
        });
        const handleKeyDown = (event) => {
            const dialog = dialogRef.current;
            if (!dialog?.contains(document.activeElement)) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleKeyDown);
            previousFocus?.focus?.();
        };
    }, []);

    const sheet = (
        <ModalBackdrop
            className={`${styles.mobileSidePaneBackdrop} mobile-sheet-backdrop-enter`}
            onClose={() => onCloseRef.current()}
            role="presentation"
        >
            <div
                ref={dialogRef}
                className={`${styles.mobileSidePaneSheet} mobile-sheet-enter`}
                role="dialog"
                aria-modal="true"
                aria-label="Program sidebar"
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                {children}
            </div>
        </ModalBackdrop>
    );

    return createPortal(sheet, document.body);
}

export default ProgramMobileSidePane;
