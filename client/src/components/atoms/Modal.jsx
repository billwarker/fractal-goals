import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';
import Card from './Card';
import CloseButton from './CloseButton';
import { Heading } from './Typography';
import ModalBackdrop from './ModalBackdrop';

/**
 * Standardized Modal Component
 */
const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'md', // sm, md, lg, xl
    className = '',
    overlayClassName = '',
    showCloseButton = true,
    closeOnEsc = true,
    closeOnBackdrop = true
}) => {
    const dialogRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const closeOnEscRef = useRef(closeOnEsc);
    useEffect(() => {
        onCloseRef.current = onClose;
        closeOnEscRef.current = closeOnEsc;
    }, [closeOnEsc, onClose]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && closeOnEscRef.current) onCloseRef.current();
            if (e.key !== 'Tab' || !dialogRef.current) return;
            const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
            if (focusable.length === 0) {
                e.preventDefault();
                dialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            const previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            const focusFrame = window.requestAnimationFrame(() => {
                const firstFocusable = dialogRef.current?.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
                (firstFocusable || dialogRef.current)?.focus();
            });

            return () => {
                window.cancelAnimationFrame(focusFrame);
                document.removeEventListener('keydown', handleKeyDown);
                document.body.style.overflow = previousOverflow;
                previousFocus?.focus?.();
            };
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const modalContent = (
        <ModalBackdrop
            className={`${styles.overlay} ${overlayClassName}`}
            closeOnBackdrop={closeOnBackdrop}
            onClose={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div
                ref={dialogRef}
                tabIndex={-1}
                className={`${styles.container} ${styles[size]} ${className}`}
                onClick={e => e.stopPropagation()}
            >
                <Card className={styles.content} padding="none">
                    <div className={styles.header}>
                        {title && (
                            <Heading level={3} className={styles.title}>
                                {title}
                            </Heading>
                        )}
                        {showCloseButton && (
                            <CloseButton onClick={onClose} />
                        )}
                    </div>

                    <div className={styles.body}>
                        {children}
                    </div>
                </Card>
            </div>
        </ModalBackdrop>
    );

    // Use portal if document.body exists, else render inline (SSR safety)
    if (typeof document !== 'undefined') {
        return createPortal(modalContent, document.body);
    }
    return modalContent;
};

export default Modal;
