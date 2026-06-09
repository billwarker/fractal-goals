import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';
import Card from './Card';
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
    showCloseButton = true,
    closeOnEsc = true,
    closeOnBackdrop = true
}) => {
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && closeOnEsc) onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEsc);
            const previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            return () => {
                document.removeEventListener('keydown', handleEsc);
                document.body.style.overflow = previousOverflow;
            };
        }

        return () => {
            document.removeEventListener('keydown', handleEsc);
        };
    }, [closeOnEsc, isOpen, onClose]);

    if (!isOpen) return null;

    const modalContent = (
        <ModalBackdrop
            className={styles.overlay}
            closeOnBackdrop={closeOnBackdrop}
            onClose={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div
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
                            <button className={styles.closeButton} onClick={onClose} aria-label="Close">
                                &times;
                            </button>
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
