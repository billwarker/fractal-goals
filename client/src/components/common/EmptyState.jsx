import React from 'react';

import Button from '../atoms/Button';
import styles from './EmptyState.module.css';

function EmptyState({
    title,
    description,
    children,
    actionLabel,
    onAction,
    className = '',
    compact = false,
    role = 'status',
}) {
    return (
        <div
            className={`${styles.emptyState} ${compact ? styles.compact : ''} ${className}`.trim()}
            role={role}
        >
            {title ? <h3 className={styles.title}>{title}</h3> : null}
            {description ? <p className={styles.description}>{description}</p> : null}
            {children ? <div className={styles.content}>{children}</div> : null}
            {actionLabel && onAction ? (
                <Button variant="primary" onClick={onAction}>
                    {actionLabel}
                </Button>
            ) : null}
        </div>
    );
}

export default EmptyState;
