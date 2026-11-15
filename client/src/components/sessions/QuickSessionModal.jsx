import React, { Suspense, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { ActiveSessionProvider } from '../../contexts/ActiveSessionContext';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import ModalBackdrop from '../atoms/ModalBackdrop';
import CardCornerActionButton from '../common/CardCornerActionButton';
import LoadingState from '../common/LoadingState';
import styles from './QuickSessionModal.module.css';

const QuickSessionWorkspace = lazyWithRetry(
    () => import('../sessionDetail/QuickSessionWorkspace'),
    'components/sessionDetail/QuickSessionWorkspace',
);

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A quick session shown over the current page instead of on its own Session Detail page
 * (the Sessions page and the program day side pane open quick sessions here). Escape or the
 * close button closes it; focus stays inside while it is open.
 */
export default function QuickSessionModal({ rootId, sessionId, sessionName, onClose }) {
    const dialogRef = useRef(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return undefined;
        dialog.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((element) => (
                !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
            ));
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

        dialog.addEventListener('keydown', handleKeyDown);
        return () => dialog.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return createPortal(
        <ModalBackdrop className={styles.overlay} onClose={onClose} role="presentation">
            <div
                ref={dialogRef}
                className={styles.modal}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={`Quick session: ${sessionName || 'Quick Session'}`}
                tabIndex={-1}
            >
                <CardCornerActionButton
                    className={styles.close}
                    onClick={onClose}
                    label="Close quick session"
                    title="Close"
                />
                <ActiveSessionProvider rootId={rootId} sessionId={sessionId}>
                    <Suspense fallback={<LoadingState label="Loading session…" />}><QuickSessionWorkspace /></Suspense>
                </ActiveSessionProvider>
            </div>
        </ModalBackdrop>,
        document.body,
    );
}
