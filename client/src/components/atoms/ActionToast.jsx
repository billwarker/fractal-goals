import React from 'react';
import toast from 'react-hot-toast';

import styles from './ActionToast.module.css';

/**
 * A toast with a message, optional detail lines, and one action (e.g. Undo). The action runs
 * once and dismisses the toast. Outside react-hot-toast, pass `onDismiss` to handle dismissal.
 */
export function ActionToast({ toastId, visible = true, message, details = [], actionLabel, onAction, onDismiss, tone = 'info' }) {
    const dismiss = onDismiss || (() => toast.dismiss(toastId));
    return (
        <div className={`${styles.toast} ${styles[tone] || ''} ${visible ? '' : styles.leaving}`} role="status" aria-live="polite">
            <div className={styles.body}>
                <p className={styles.message}>{message}</p>
                {details.length > 0 ? (
                    <ul className={styles.details}>
                        {details.map((detail) => <li key={detail}>{detail}</li>)}
                    </ul>
                ) : null}
            </div>
            {actionLabel && onAction ? (
                <button
                    type="button"
                    className={styles.action}
                    onClick={() => {
                        dismiss();
                        onAction();
                    }}
                >
                    {actionLabel}
                </button>
            ) : null}
            <button type="button" className={styles.close} aria-label="Dismiss" onClick={dismiss}>×</button>
        </div>
    );
}

/** Show an action toast; returns its id. Passing `id` replaces a toast already showing under it. */
export function showActionToast({ id, duration = 8000, ...props }) {
    return toast.custom((t) => <ActionToast toastId={t.id} visible={t.visible} {...props} />, { id, duration });
}

export default ActionToast;
