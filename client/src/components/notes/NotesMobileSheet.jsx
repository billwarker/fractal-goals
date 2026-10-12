import React from 'react';

import Button from '../atoms/Button';
import ModalBackdrop from '../atoms/ModalBackdrop';
import BodyPortal from '../layout/BodyPortal';
import styles from './NotesMobileSheet.module.css';

/**
 * Mobile bottom sheet for the Notes page: filters while browsing, the
 * associator while composing.
 */
export default function NotesMobileSheet({
    open,
    composing,
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
                    <div className={styles.handle} />
                    <div className={styles.header}>
                        <div className={styles.headerCopy}>
                            <div className={styles.title}>{composing ? 'Associator' : 'Filters'}</div>
                            <div className={styles.subtitle}>
                                {composing ? 'Link this note to a goal or activity.' : `${total} note${total !== 1 ? 's' : ''} shown`}
                            </div>
                        </div>
                        <div className={styles.actions}>
                            {!composing ? (
                                <Button variant="secondary" size="sm" className={styles.actionButton} onClick={onReset} disabled={!hasActiveFilters}>
                                    Reset
                                </Button>
                            ) : null}
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
