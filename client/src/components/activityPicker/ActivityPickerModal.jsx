import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

import ModalBackdrop from '../atoms/ModalBackdrop';
import ActivityPicker from './ActivityPicker';
import styles from './ActivityPickerModal.module.css';

function ActivityPickerModal({
    isOpen = true,
    title = 'Select Activity',
    onClose,
    ...pickerProps
}) {
    useEffect(() => {
        if (!isOpen) return undefined;

        const handleEsc = (event) => {
            if (event.key === 'Escape') onClose?.();
        };
        document.addEventListener('keydown', handleEsc);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const modalContent = (
        <ModalBackdrop className={styles.overlay} onClose={onClose}>
            <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
                <ActivityPicker
                    {...pickerProps}
                    title={title}
                    variant="modal"
                    onClose={onClose}
                />
            </div>
        </ModalBackdrop>
    );

    if (typeof document !== 'undefined') {
        return createPortal(modalContent, document.body);
    }

    return modalContent;
}

export default ActivityPickerModal;
