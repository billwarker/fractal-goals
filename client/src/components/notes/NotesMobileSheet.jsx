import React from 'react';

import Button from '../atoms/Button';
import ModalBackdrop from '../atoms/ModalBackdrop';
import BodyPortal from '../layout/BodyPortal';
import SheetHandle from '../layout/SheetHandle';
import styles from './NotesMobileSheet.module.css';

/** Mobile bottom sheet holding the Notes page filters. */
export default function NotesMobileSheet({
    open,
    total,
    hasActiveFilters,
    onReset,
    onClose,
    children,
}) {
    return (
        <BodyPortal when={open}>
            <ModalBackdrop className={`${styles.backdrop} mobile-sheet-backdrop-enter`} onClose={onClose}>
                <div className={`${styles.card} mobile-sheet-enter`} onClick={(event) => event.stopPropagation()}>
                    <SheetHandle onDismiss={onClose} />
                    <div className={styles.header}>
                        <div className={styles.headerCopy}>
                            <div className={styles.title}>Filters</div>
                            <div className={styles.subtitle}>{`${total} note${total !== 1 ? 's' : ''} shown`}</div>
                        </div>
                        <div className={styles.actions}>
                            <Button variant="secondary" size="sm" className={styles.actionButton} onClick={onReset} disabled={!hasActiveFilters}>
                                Reset
                            </Button>
                            <Button variant="secondary" size="sm" className={styles.actionButton} onClick={onClose}>
                                Hide
                            </Button>
                        </div>
                    </div>
                    <div className={styles.body}>{children}</div>
                </div>
            </ModalBackdrop>
        </BodyPortal>
    );
}
