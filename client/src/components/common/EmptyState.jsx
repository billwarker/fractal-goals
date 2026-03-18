import React from 'react';

import Button from '../atoms/Button';
import styles from './EmptyState.module.css';

function EmptyState({
    title,
    description,
    actionLabel,
    onAction,
    className = '',
}) {
    return (
        <div className={`${styles.emptyState} ${className}`.trim()}>
            {title ? <h3 className={styles.title}>{title}</h3> : null}
            {description ? <p className={styles.description}>{description}</p> : null}
            {actionLabel && onAction ? (
                <Button variant="primary" onClick={onAction}>
                    {actionLabel}
                </Button>
            ) : null}
        </div>
    );
}

export default EmptyState;
