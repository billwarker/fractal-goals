import React from 'react';

import useLoadEscalation from '../../hooks/useLoadEscalation';
import Button from '../atoms/Button';
import Spinner from '../atoms/Spinner';
import styles from './LoadingState.module.css';

export const SLOW_LOADING_TEXT = 'Still loading…';
export const WAKING_SERVER_TEXT = 'The server may be waking up after a quiet spell. This can take up to 20 seconds.';

/**
 * The one loading state. It stays invisible for `delayMs` so fast loads don't flash, then
 * shows the spinner, and after a few seconds explains the wait: still loading, or a server
 * that may be waking up. With `error` it offers `onRetry`.
 *
 * variant: 'page' (fills the view), 'section' (a panel or list), 'inline' (beside other content).
 */
function LoadingState({
    label = 'Loading…',
    variant = 'section',
    delayMs,
    error = null,
    errorLabel = 'This couldn’t load.',
    onRetry,
    className = '',
    showSpinner = true,
}) {
    const { stage, serverSlow } = useLoadEscalation({ delayMs });
    const classes = `${styles.loadingState} ${styles[variant] || ''} ${className}`.trim();

    if (error) {
        return (
            <div className={`${classes} ${styles.failed}`} role="alert">
                <span className={styles.label}>{errorLabel}</span>
                {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
            </div>
        );
    }

    if (stage === 'hidden') {
        // Holds the space (and tells assistive tech and tests a load is underway) without a flash.
        return <div className={`${classes} ${styles.pending}`} aria-busy="true" aria-label={label} />;
    }

    return (
        <div className={classes} role="status" aria-live="polite" aria-busy="true">
            {showSpinner && <Spinner size={variant === 'inline' ? 'sm' : 'md'} role="presentation" aria-hidden="true" aria-label={undefined} />}
            <span className={styles.label}>{label}</span>
            {stage === 'slow' && (
                <span className={styles.hint}>{serverSlow ? WAKING_SERVER_TEXT : SLOW_LOADING_TEXT}</span>
            )}
        </div>
    );
}

export default LoadingState;
